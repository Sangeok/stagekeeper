#include <dlfcn.h>
#include <errno.h>
#include <libproc.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/time.h>
#include <unistd.h>

typedef int (*sandbox_check_fn)(pid_t, const char *, int, ...);

enum { FILTER_NONE = 0, FILTER_PATH = 1, ZOMBIE_STATUS = 5, MAX_ROUNDS = 200, MAX_MATCHES = 4096 };

struct match {
    pid_t pid;
    bool timed;
    uint64_t seconds;
    uint64_t microseconds;
};

static sandbox_check_fn check;
static int path_filter;
static const char *allowed;
static const char *denied;

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

static bool owned(pid_t pid) {
    return check(pid, NULL, FILTER_NONE) == 1 && check(pid, "file-read-data", path_filter, allowed) == 0
        && check(pid, "file-read-data", path_filter, denied) == 1;
}

static bool information(pid_t pid, struct proc_bsdinfo *info) {
    return proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, info, (int)sizeof(*info)) == (int)sizeof(*info);
}

int main(int argc, char **argv) {
    require(argc == 5, "arguments");
    allowed = argv[1];
    denied = argv[2];
    int limit = atoi(argv[3]);
    bool terminate = strcmp(argv[4], "kill") == 0;
    require(terminate || strcmp(argv[4], "scan") == 0, "mode");
    require(limit > 0 && limit <= MAX_ROUNDS, "rounds");
    check = (sandbox_check_fn)dlsym(RTLD_DEFAULT, "sandbox_check");
    require(check != NULL, "sandbox-check-symbol");
    const int *no_report = (const int *)dlsym(RTLD_DEFAULT, "SANDBOX_CHECK_NO_REPORT");
    require(no_report != NULL, "no-report-symbol");
    path_filter = FILTER_PATH | *no_report;
    static struct match matches[MAX_MATCHES];
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
        int sandboxed = 0, zombies = 0, errors = 0, matched = 0, overflow = 0, untimed = 0, skipped = 0;
        for (int index = 0; index < count; index++) {
            pid_t pid = pids[index];
            if (pid <= 0) continue;
            struct proc_bsdinfo info;
            bool timed = information(pid, &info);
            if (timed && info.pbi_status == ZOMBIE_STATUS) {
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
            if (!owned(pid)) continue;
            if (matched == MAX_MATCHES) {
                overflow++;
                continue;
            }
            if (!timed) untimed++;
            matches[matched++] = (struct match){ pid, timed, timed ? info.pbi_start_tvsec : 0, timed ? info.pbi_start_tvusec : 0 };
        }
        free(pids);
        if (terminate) {
            for (int index = 0; index < matched; index++) {
                struct proc_bsdinfo current;
                if (matches[index].timed && information(matches[index].pid, &current) && current.pbi_start_tvsec == matches[index].seconds
                    && current.pbi_start_tvusec == matches[index].microseconds && owned(matches[index].pid)) kill(matches[index].pid, SIGKILL);
                else skipped++;
            }
        }
        long long elapsed = now_micros() - started;
        printf("%s{\"total\":%d,\"sandboxed\":%d,\"zombies\":%d,\"errors\":%d,\"overflow\":%d,\"untimed\":%d,\"skipped\":%d,\"micros\":%lld,\"matches\":[",
            round ? "," : "", count, sandboxed, zombies, errors, overflow, untimed, skipped, elapsed);
        for (int index = 0; index < matched; index++) printf("%s%d", index ? "," : "", matches[index].pid);
        printf("]}");
        if (matched == 0 && overflow == 0) {
            quiescent = true;
            break;
        }
        if (!terminate) break;
    }
    printf("],\"quiescent\":%s}\n", quiescent ? "true" : "false");
    return 0;
}
