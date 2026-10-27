#include <dlfcn.h>
#include <errno.h>
#include <libproc.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/time.h>
#include <unistd.h>

typedef int (*sandbox_check_fn)(pid_t, const char *, int, ...);

enum { FILTER_NONE = 0, FILTER_PATH = 1, ZOMBIE_STATUS = 5, MAX_ROUNDS = 200, MAX_MATCHES = 4096 };

static void require(bool condition, const char *stage) {
    if (!condition) {
        fprintf(stderr, "sandbox-identity:%s errno=%d\n", stage, errno);
        exit(1);
    }
}

static long long now_micros(void) {
    struct timeval now;
    gettimeofday(&now, NULL);
    return (long long)now.tv_sec * 1000000LL + (long long)now.tv_usec;
}

int main(int argc, char **argv) {
    require(argc == 5, "arguments");
    const char *allowed = argv[1];
    const char *denied = argv[2];
    int limit = atoi(argv[3]);
    bool terminate = strcmp(argv[4], "kill") == 0;
    require(terminate || strcmp(argv[4], "scan") == 0, "mode");
    require(limit > 0 && limit <= MAX_ROUNDS, "rounds");
    sandbox_check_fn check = (sandbox_check_fn)dlsym(RTLD_DEFAULT, "sandbox_check");
    require(check != NULL, "sandbox-check-symbol");
    const int *no_report = (const int *)dlsym(RTLD_DEFAULT, "SANDBOX_CHECK_NO_REPORT");
    require(no_report != NULL, "no-report-symbol");
    int path_filter = FILTER_PATH | *no_report;
    static pid_t matches[MAX_MATCHES];
    printf("{\"selfSandboxed\":%d,\"noReport\":%d,\"rounds\":[", check(getpid(), NULL, FILTER_NONE), *no_report);
    bool quiescent = false;
    for (int round = 0; round < limit; round++) {
        long long started = now_micros();
        int estimate = proc_listallpids(NULL, 0);
        require(estimate > 0, "pid-estimate");
        int capacity = estimate + 512;
        pid_t *pids = calloc((size_t)capacity, sizeof(pid_t));
        require(pids != NULL, "allocate");
        int count = proc_listallpids(pids, capacity * (int)sizeof(pid_t));
        require(count > 0 && count <= capacity, "pid-list");
        int sandboxed = 0, zombies = 0, errors = 0, matched = 0, overflow = 0;
        for (int index = 0; index < count; index++) {
            pid_t pid = pids[index];
            if (pid <= 0) continue;
            struct proc_bsdinfo info;
            if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, (int)sizeof(info)) == (int)sizeof(info) && info.pbi_status == ZOMBIE_STATUS) {
                zombies++;
                continue;
            }
            int state = check(pid, NULL, FILTER_NONE);
            if (state < 0) {
                errors++;
                continue;
            }
            if (state == 0) continue;
            sandboxed++;
            if (check(pid, "file-read-data", path_filter, allowed) == 0 && check(pid, "file-read-data", path_filter, denied) == 1) {
                if (matched < MAX_MATCHES) matches[matched++] = pid;
                else overflow++;
            }
        }
        free(pids);
        long long elapsed = now_micros() - started;
        printf("%s{\"total\":%d,\"sandboxed\":%d,\"zombies\":%d,\"errors\":%d,\"overflow\":%d,\"micros\":%lld,\"matches\":[",
            round ? "," : "", count, sandboxed, zombies, errors, overflow, elapsed);
        for (int index = 0; index < matched; index++) printf("%s%d", index ? "," : "", matches[index]);
        printf("]}");
        if (matched == 0 && overflow == 0) {
            quiescent = true;
            break;
        }
        if (!terminate) break;
        for (int index = 0; index < matched; index++) kill(matches[index], SIGKILL);
    }
    printf("],\"quiescent\":%s}\n", quiescent ? "true" : "false");
    return 0;
}
