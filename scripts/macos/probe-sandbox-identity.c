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
#include <time.h>
#include <unistd.h>

typedef int (*sandbox_check_fn)(pid_t, const char *, int, ...);

enum { FILTER_NONE = 0, FILTER_PATH = 1, ZOMBIE_STATUS = 5, MAX_ROUNDS = 200, MAX_MATCHES = 4096, CONFIRMATIONS = 3 };

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

static bool same(const struct match *value) {
    struct proc_bsdinfo current;
    return value->timed && information(value->pid, &current) && current.pbi_start_tvsec == value->seconds
        && current.pbi_start_tvusec == value->microseconds && owned(value->pid);
}

int main(int argc, char **argv) {
    require(argc == 5, "arguments");
    allowed = argv[1];
    denied = argv[2];
    int limit = atoi(argv[3]);
    bool freeze = strcmp(argv[4], "freeze") == 0;
    bool terminate = freeze || strcmp(argv[4], "kill") == 0;
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
    int zero_rounds = 0;
    for (int round = 0; round < limit; round++) {
        long long started = now_micros();
        int estimate = proc_listallpids(NULL, 0);
        require(estimate > 0, "pid-estimate");
        int capacity = estimate + 512;
        pid_t *pids = calloc((size_t)capacity, sizeof(pid_t));
        require(pids != NULL, "allocate");
        int count = proc_listallpids(pids, capacity * (int)sizeof(pid_t));
        require(count > 0 && count <= capacity, "pid-list");
        int sandboxed = 0, zombies = 0, errors = 0, matched = 0, overflow = 0, untimed = 0, skipped = 0, frozen = 0;
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
            matches[matched] = (struct match){ pid, timed, timed ? info.pbi_start_tvsec : 0, timed ? info.pbi_start_tvusec : 0 };
            if (freeze && timed && kill(pid, SIGSTOP) == 0) frozen++;
            matched++;
        }
        free(pids);
        if (terminate) {
            for (int index = 0; index < matched; index++) {
                if (same(&matches[index])) kill(matches[index].pid, SIGKILL);
                else skipped++;
            }
        }
        long long elapsed = now_micros() - started;
        printf("%s{\"total\":%d,\"sandboxed\":%d,\"zombies\":%d,\"errors\":%d,\"overflow\":%d,\"untimed\":%d,\"frozen\":%d,\"skipped\":%d,\"micros\":%lld,\"matches\":[",
            round ? "," : "", count, sandboxed, zombies, errors, overflow, untimed, frozen, skipped, elapsed);
        for (int index = 0; index < matched; index++) printf("%s%d", index ? "," : "", matches[index].pid);
        printf("]}");
        if (matched == 0 && overflow == 0) {
            zero_rounds++;
            if (!freeze || zero_rounds >= CONFIRMATIONS) {
                quiescent = true;
                break;
            }
            struct timespec pause = { 0, 10000000 };
            nanosleep(&pause, NULL);
            continue;
        }
        zero_rounds = 0;
        if (!terminate) break;
    }
    printf("],\"quiescent\":%s}\n", quiescent ? "true" : "false");
    return 0;
}
