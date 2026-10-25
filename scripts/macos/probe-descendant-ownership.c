#include <sys/event.h>
#include <sys/proc_info.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <libproc.h>
#include <errno.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

enum { DESCENDANTS = 4 };

struct identity {
    pid_t pid;
    uint64_t seconds;
    uint64_t microseconds;
};

static void require(int condition, const char *stage) {
    if (!condition) {
        fprintf(stderr, "ownership-probe:%s errno=%d\n", stage, errno);
        exit(1);
    }
}

static void send_bytes(int fd, const void *value, size_t length) {
    const char *cursor = value;
    while (length) {
        ssize_t count = write(fd, cursor, length);
        if (count < 0 && errno == EINTR) continue;
        require(count > 0, "pipe-write");
        cursor += count;
        length -= (size_t)count;
    }
}

static void receive_bytes(int fd, void *value, size_t length) {
    char *cursor = value;
    while (length) {
        ssize_t count = read(fd, cursor, length);
        if (count < 0 && errno == EINTR) continue;
        require(count > 0, "pipe-read");
        cursor += count;
        length -= (size_t)count;
    }
}

static struct proc_bsdinfo process_info(pid_t pid) {
    struct proc_bsdinfo info = {0};
    require(proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) == sizeof(info), "process-identity");
    return info;
}

static int watch_process(int queue, pid_t pid, unsigned int flags) {
    struct kevent change, receipt;
    EV_SET(&change, (uintptr_t)pid, EVFILT_PROC, EV_ADD | EV_CLEAR | EV_RECEIPT, flags, 0, NULL);
    int count = kevent(queue, &change, 1, &receipt, 1, NULL);
    require(count == 1 && (receipt.flags & EV_ERROR), "watch-receipt");
    return (int)receipt.data;
}

static void descendant(int lease, int oracle) {
    alarm(20);
    require(setsid() == getpid(), "descendant-session");
    struct proc_bsdinfo info = process_info(getpid());
    struct identity identity = { getpid(), info.pbi_start_tvsec, info.pbi_start_tvusec };
    send_bytes(oracle, &identity, sizeof(identity));
    close(oracle);
    char value;
    ssize_t count;
    do { count = read(lease, &value, 1); } while (count < 0 && errno == EINTR);
    require(count == 0, "cleanup-lease-eof");
    _exit(0);
}

static void root_process(int gate, int lease, int oracle, int ready, int output, int group_kill) {
    alarm(20);
    require(setpgid(0, 0) == 0, "root-group");
    char value;
    receive_bytes(gate, &value, 1);
    close(gate);
    for (int index = 0; index < DESCENDANTS; index++) {
        pid_t intermediate = fork();
        require(intermediate >= 0, "intermediate-fork");
        if (intermediate == 0) {
            close(ready);
            close(output);
            pid_t child = fork();
            require(child >= 0, "descendant-fork");
            if (child == 0) descendant(lease, oracle);
            _exit(0);
        }
        int status;
        require(waitpid(intermediate, &status, 0) == intermediate && WIFEXITED(status) && WEXITSTATUS(status) == 0, "intermediate-exit");
    }
    send_bytes(ready, "R", 1);
    close(ready);
    send_bytes(output, "O", 1);
    if (group_kill) for (;;) pause();
    _exit(0);
}

static void run_scenario(int group_kill) {
    int gate[2], lease[2], oracle[2], ready[2], output[2];
    require(pipe(gate) == 0 && pipe(lease) == 0 && pipe(oracle) == 0 && pipe(ready) == 0 && pipe(output) == 0, "pipes");
    pid_t root = fork();
    require(root >= 0, "root-fork");
    if (root == 0) {
        close(gate[1]); close(lease[1]); close(oracle[0]); close(ready[0]); close(output[0]);
        root_process(gate[0], lease[0], oracle[1], ready[1], output[1], group_kill);
    }
    close(gate[0]); close(lease[0]); close(oracle[1]); close(ready[1]); close(output[1]);
    int queue = kqueue(), tracking_queue = kqueue();
    require(queue >= 0 && tracking_queue >= 0, "kqueue-create");
    int tracking_error = watch_process(tracking_queue, root, NOTE_FORK | NOTE_EXIT | NOTE_TRACK);
    require(tracking_error == ENOTSUP, "recursive-tracking-must-be-reassessed");
    close(tracking_queue);
    require(watch_process(queue, root, NOTE_FORK | NOTE_EXIT) == 0, "root-watch-positive-control");
    send_bytes(gate[1], "G", 1);
    close(gate[1]);
    struct identity identities[DESCENDANTS];
    for (int index = 0; index < DESCENDANTS; index++) receive_bytes(oracle[0], &identities[index], sizeof(identities[index]));
    close(oracle[0]);
    char value;
    receive_bytes(ready[0], &value, 1);
    require(value == 'R', "root-ready");
    close(ready[0]);
    if (group_kill) require(kill(-root, SIGKILL) == 0, "root-group-kill");
    int status;
    require(waitpid(root, &status, 0) == root, "root-reap");
    require(group_kill ? (WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL) : (WIFEXITED(status) && WEXITSTATUS(status) == 0), "root-terminal");
    receive_bytes(output[0], &value, 1);
    require(value == 'O' && read(output[0], &value, 1) == 0, "output-eof");
    close(output[0]);
    pid_t children[DESCENDANTS * 2];
    int listed_bytes = proc_listchildpids(root, children, sizeof(children));
    require(listed_bytes <= 0, "root-child-snapshot-empty");
    struct kevent events[DESCENDANTS * 2];
    struct timespec no_wait = {0, 0};
    int event_count = kevent(queue, NULL, 0, events, DESCENDANTS * 2, &no_wait);
    require(event_count == 1, "fork-events-coalesced");
    require(events[0].ident == (uintptr_t)root && events[0].filter == EVFILT_PROC && events[0].data == 0, "no-descendant-identity");
    require((events[0].fflags & (NOTE_FORK | NOTE_EXIT)) == (NOTE_FORK | NOTE_EXIT), "fork-and-root-exit-notified");
    require(!(events[0].fflags & (NOTE_CHILD | NOTE_TRACKERR)), "no-child-notification");
    for (int index = 0; index < DESCENDANTS; index++) {
        struct identity identity = identities[index];
        require(identity.pid > 1 && identity.pid != root && identity.pid != getpid(), "oracle-pid");
        for (int prior = 0; prior < index; prior++) require(identities[prior].pid != identity.pid, "unique-descendant");
        struct proc_bsdinfo info = process_info(identity.pid);
        require(info.pbi_start_tvsec == identity.seconds && info.pbi_start_tvusec == identity.microseconds, "oracle-birth-identity");
        require(info.pbi_ppid != (uint32_t)root && info.pbi_pgid == (uint32_t)identity.pid, "orphan-outside-root-group");
        require(watch_process(queue, identity.pid, NOTE_EXIT) == 0, "known-descendant-watch-positive-control");
    }
    close(lease[1]);
    int exited = 0, seen[DESCENDANTS] = {0};
    while (exited < DESCENDANTS) {
        struct timespec deadline = {5, 0};
        int count = kevent(queue, NULL, 0, events, DESCENDANTS * 2, &deadline);
        require(count > 0, "owned-descendant-exit-deadline");
        for (int index = 0; index < count; index++) {
            require(events[index].filter == EVFILT_PROC && (events[index].fflags & NOTE_EXIT), "owned-descendant-exit-event");
            int found = 0;
            for (int child = 0; child < DESCENDANTS; child++) {
                if (events[index].ident != (uintptr_t)identities[child].pid) continue;
                require(!seen[child], "unique-exit-event");
                seen[child] = 1; exited++; found = 1;
            }
            require(found, "only-owned-exit-event");
        }
    }
    close(queue);
    printf("{\"scenario\":\"%s\",\"recursiveTrackingErrno\":%d,\"recursiveTrackingRejected\":true,\"rootTerminal\":true,\"outputEof\":true,\"rootChildSnapshotEmpty\":true,\"directForks\":%d,\"coalescedRootEvents\":%d,\"descendantIdentityInEvent\":false,\"detachedOrphansAlive\":%d,\"knownIdentityExitEvents\":%d,\"ownedDescendantsExited\":true}", group_kill ? "group-kill" : "root-exit", tracking_error, DESCENDANTS, event_count, DESCENDANTS, exited);
}

int main(void) {
    alarm(45);
    require(getuid() != 0 && geteuid() != 0, "ordinary-user-required");
    printf("{\"ordinaryUser\":true,\"scenarios\":[");
    run_scenario(0);
    printf(",");
    run_scenario(1);
    printf("]}\n");
    return 0;
}
