#include <sys/event.h>
#include <sys/proc_info.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <libproc.h>
#include <limits.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <spawn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

extern char **environ;
enum { ROOT, SAME_GROUP, DETACHED, DETACHED_LEAF, RACE_FIRST, RACE_LAST, LIMIT };

struct identity {
    int role;
    pid_t pid;
    pid_t group;
    uint64_t seconds;
    uint64_t microseconds;
};

struct owned_process {
    struct identity identity;
    int socket;
    int exited;
};

static void require(int condition, const char *stage) {
    if (!condition) {
        fprintf(stderr, "launchd-probe:%s errno=%d\n", stage, errno);
        exit(1);
    }
}

static uint64_t milliseconds(void) {
    struct timespec value;
    require(clock_gettime(CLOCK_MONOTONIC, &value) == 0, "clock");
    return (uint64_t)value.tv_sec * 1000 + (uint64_t)value.tv_nsec / 1000000;
}

static void transfer(int fd, void *data, size_t length, int sending) {
    char *cursor = data;
    while (length) {
        ssize_t count = sending ? write(fd, cursor, length) : read(fd, cursor, length);
        if (count < 0 && errno == EINTR) continue;
        require(count > 0, sending ? "socket-write" : "socket-read");
        cursor += count;
        length -= (size_t)count;
    }
}

static void send_command(int socket, char command) {
    transfer(socket, &command, 1, 1);
}

static struct proc_bsdinfo process_info(pid_t pid) {
    struct proc_bsdinfo info = {0};
    require(proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) == sizeof(info), "process-identity");
    return info;
}

static struct sockaddr_un address(void) {
    struct sockaddr_un value = {0};
    value.sun_family = AF_UNIX;
    strcpy(value.sun_path, "channel.sock");
    return value;
}

static int connect_identity(int role) {
    int connection = socket(AF_UNIX, SOCK_STREAM, 0);
    require(connection >= 0, "client-socket");
    struct sockaddr_un value = address();
    require(connect(connection, (struct sockaddr *)&value, sizeof(value)) == 0, "client-connect");
    struct proc_bsdinfo info = process_info(getpid());
    struct identity identity = { role, getpid(), getpgrp(), info.pbi_start_tvsec, info.pbi_start_tvusec };
    transfer(connection, &identity, sizeof(identity), 1);
    char ack;
    transfer(connection, &ack, 1, 0);
    require(ack == 'A', "identity-registered");
    return connection;
}

static void child_process(int role);

static void fork_detached(int role) {
    pid_t intermediate = fork();
    require(intermediate >= 0, "intermediate-fork");
    if (intermediate == 0) {
        pid_t child = fork();
        require(child >= 0, "detached-fork");
        if (child == 0) {
            require(setsid() == getpid(), "detached-session");
            child_process(role);
        }
        _exit(0);
    }
    int status;
    require(waitpid(intermediate, &status, 0) == intermediate && WIFEXITED(status) && WEXITSTATUS(status) == 0, "intermediate-exit");
}

static void child_process(int role) {
    alarm(30);
    require(signal(SIGTERM, SIG_DFL) != SIG_ERR, "child-default-term");
    int connection = connect_identity(role);
    for (;;) {
        char command;
        ssize_t count = read(connection, &command, 1);
        if (count < 0 && errno == EINTR) continue;
        if (count == 0) _exit(0);
        require(count == 1 && command == 'F' && role == DETACHED, "child-command");
        close(connection);
        fork_detached(RACE_FIRST);
        fork_detached(RACE_LAST);
        _exit(0);
    }
}

static void worker(int ignore_term) {
    alarm(30);
    require(getpid() == getpgrp(), "launchd-root-group");
    if (ignore_term) require(signal(SIGTERM, SIG_IGN) != SIG_ERR, "ignore-term");
    int connection = connect_identity(ROOT);
    pid_t same = fork();
    require(same >= 0, "same-group-fork");
    if (same == 0) {
        close(connection);
        child_process(SAME_GROUP);
    }
    int copy = dup(connection);
    require(copy >= 0, "root-connection-copy");
    close(connection);
    require(fcntl(copy, F_SETFD, FD_CLOEXEC) == 0, "root-close-on-exec");
    for (int role = DETACHED; role <= DETACHED_LEAF; role++) {
        pid_t intermediate = fork();
        require(intermediate >= 0, "root-intermediate-fork");
        if (intermediate == 0) {
            close(copy);
            pid_t child = fork();
            require(child >= 0, "root-detached-fork");
            if (child == 0) {
                require(setsid() == getpid(), "root-detached-session");
                child_process(role);
            }
            _exit(0);
        }
        int status;
        require(waitpid(intermediate, &status, 0) == intermediate && WIFEXITED(status) && WEXITSTATUS(status) == 0, "root-intermediate-exit");
    }
    char command;
    ssize_t count;
    do { count = read(copy, &command, 1); } while (count < 0 && errno == EINTR);
    require(count == 0 || (count == 1 && command == 'E'), "root-exit-command");
    _exit(0);
}

static pid_t launchctl_start(char *const arguments[]) {
    posix_spawn_file_actions_t actions;
    require(posix_spawn_file_actions_init(&actions) == 0, "spawn-actions");
    require(posix_spawn_file_actions_addopen(&actions, STDOUT_FILENO, "/dev/null", O_WRONLY, 0) == 0, "spawn-output");
    pid_t child;
    int error = posix_spawn(&child, "/bin/launchctl", &actions, NULL, arguments, environ);
    posix_spawn_file_actions_destroy(&actions);
    require(error == 0, "launchctl-spawn");
    return child;
}

static void launchctl_wait(pid_t child) {
    int status;
    require(waitpid(child, &status, 0) == child, "launchctl-wait");
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) fprintf(stderr, "launchd-probe:launchctl-status=%d\n", status);
    require(WIFEXITED(status) && WEXITSTATUS(status) == 0, "launchctl-success");
}

static void accept_process(int listener, int queue, struct owned_process processes[LIMIT]) {
    int connection = accept(listener, NULL, NULL);
    require(connection >= 0 && fcntl(connection, F_SETFD, FD_CLOEXEC) == 0, "accept-client");
    struct identity identity;
    transfer(connection, &identity, sizeof(identity), 0);
    require(identity.role >= ROOT && identity.role < LIMIT && processes[identity.role].socket == -1 && identity.pid > 1, "oracle-identity");
    struct proc_bsdinfo info = process_info(identity.pid);
    require(info.pbi_start_tvsec == identity.seconds && info.pbi_start_tvusec == identity.microseconds && info.pbi_pgid == (uint32_t)identity.group, "oracle-birth-identity");
    if (identity.role > SAME_GROUP) require(identity.group == identity.pid, "detached-group");
    struct kevent change, receipt;
    EV_SET(&change, (uintptr_t)identity.pid, EVFILT_PROC, EV_ADD | EV_CLEAR | EV_RECEIPT, NOTE_EXIT, 0, NULL);
    require(kevent(queue, &change, 1, &receipt, 1, NULL) == 1 && (receipt.flags & EV_ERROR) && receipt.data == 0, "exit-watch");
    info = process_info(identity.pid);
    require(info.pbi_start_tvsec == identity.seconds && info.pbi_start_tvusec == identity.microseconds, "registered-birth-identity");
    processes[identity.role] = (struct owned_process){identity, connection, 0};
    send_command(connection, 'A');
}

static void collect_exits(int queue, struct owned_process processes[LIMIT], long nanoseconds) {
    struct timespec timeout = {0, nanoseconds};
    struct kevent events[LIMIT];
    int count = kevent(queue, NULL, 0, events, LIMIT, &timeout);
    require(count >= 0, "exit-events");
    for (int index = 0; index < count; index++) {
        require(events[index].filter == EVFILT_PROC && (events[index].fflags & NOTE_EXIT), "exit-event-kind");
        int found = 0;
        for (int role = ROOT; role < LIMIT; role++) {
            if (processes[role].socket == -1 || events[index].ident != (uintptr_t)processes[role].identity.pid) continue;
            require(!processes[role].exited, "unique-exit");
            processes[role].exited = 1;
            found = 1;
        }
        require(found, "owned-exit-event");
    }
}

static void wait_root_and_group(int queue, struct owned_process processes[LIMIT]) {
    uint64_t deadline = milliseconds() + 10000;
    while (!processes[ROOT].exited || !processes[SAME_GROUP].exited) {
        require(milliseconds() < deadline, "root-group-exit-deadline");
        collect_exits(queue, processes, 100000000);
    }
}

static int controller(char *domain, char *target, char *scenario) {
    alarm(25);
    require(getuid() != 0 && geteuid() != 0, "ordinary-user-required");
    struct owned_process processes[LIMIT];
    for (int role = ROOT; role < LIMIT; role++) processes[role] = (struct owned_process){.socket = -1};
    int listener = socket(AF_UNIX, SOCK_STREAM, 0), queue = kqueue();
    require(listener >= 0 && queue >= 0 && fcntl(listener, F_SETFD, FD_CLOEXEC) == 0, "controller-handles");
    struct sockaddr_un value = address();
    require(bind(listener, (struct sockaddr *)&value, sizeof(value)) == 0 && listen(listener, LIMIT) == 0, "controller-listen");
    char plist[PATH_MAX];
    require(getcwd(plist, sizeof(plist)) != NULL, "plist-working-directory");
    size_t used = strlen(plist);
    require(used + sizeof("/job.plist") <= sizeof(plist), "plist-path-length");
    strcpy(plist + used, "/job.plist");
    char *bootstrap[] = {"launchctl", "bootstrap", domain, plist, NULL};
    launchctl_wait(launchctl_start(bootstrap));
    for (int role = ROOT; role <= DETACHED_LEAF; role++) accept_process(listener, queue, processes);
    require(processes[SAME_GROUP].identity.group == processes[ROOT].identity.group, "same-group-positive-control");
    int timeout = strcmp(scenario, "timeout-bootout") == 0;
    int race = strcmp(scenario, "fork-during-bootout") == 0;
    if (timeout) {
        char *terminate[] = {"launchctl", "kill", "SIGTERM", target, NULL};
        launchctl_wait(launchctl_start(terminate));
        collect_exits(queue, processes, 300000000);
        require(!processes[ROOT].exited, "term-ignored-positive-control");
    }
    uint64_t started = milliseconds();
    int removed = 0;
    if (strcmp(scenario, "root-exit") == 0) {
        send_command(processes[ROOT].socket, 'E');
    } else if (strcmp(scenario, "service-sigkill") == 0) {
        char *kill_root[] = {"launchctl", "kill", "SIGKILL", target, NULL};
        launchctl_wait(launchctl_start(kill_root));
    } else {
        char *bootout[] = {"launchctl", "bootout", target, NULL};
        pid_t request = launchctl_start(bootout);
        if (race) {
            send_command(processes[DETACHED].socket, 'F');
            for (int role = RACE_FIRST; role <= RACE_LAST; role++) accept_process(listener, queue, processes);
        }
        launchctl_wait(request);
        removed = 1;
    }
    wait_root_and_group(queue, processes);
    uint64_t action_duration = milliseconds() - started;
    if (!removed) {
        char *bootout[] = {"launchctl", "bootout", target, NULL};
        launchctl_wait(launchctl_start(bootout));
    }
    collect_exits(queue, processes, 300000000);
    int survivor_count = 0, registered = race ? LIMIT : DETACHED_LEAF + 1;
    for (int role = DETACHED; role < registered; role++) {
        if (race && role == DETACHED) continue;
        require(!processes[role].exited, "detached-survival-must-be-reassessed");
        struct proc_bsdinfo info = process_info(processes[role].identity.pid);
        require(info.pbi_start_tvsec == processes[role].identity.seconds && info.pbi_start_tvusec == processes[role].identity.microseconds, "survivor-birth-identity");
        require(info.pbi_pgid == (uint32_t)processes[role].identity.pid, "survivor-session");
        survivor_count++;
    }
    for (int role = ROOT; role < registered; role++) {
        shutdown(processes[role].socket, SHUT_RDWR);
    }
    uint64_t deadline = milliseconds() + 5000;
    int exited;
    do {
        exited = 0;
        collect_exits(queue, processes, 100000000);
        for (int role = ROOT; role < registered; role++) exited += processes[role].exited;
        require(milliseconds() < deadline, "fixture-cleanup-deadline");
    } while (exited != registered);
    for (int role = ROOT; role < registered; role++) close(processes[role].socket);
    close(queue); close(listener);
    require(unlink("channel.sock") == 0, "socket-cleanup");
    printf("{\"scenario\":\"%s\",\"ordinaryUser\":true,\"registeredProcesses\":%d,\"rootExitObserved\":true,\"sameGroupExitObserved\":true,\"serviceBootoutSucceeded\":true,\"detachedSurvivorsAfterBootout\":%d,\"termIgnoredBeforeBootout\":%s,\"forksRequestedAlongsideBootout\":%d,\"actionDurationMs\":%llu,\"fixtureExitEvents\":%d,\"ownedFixtureProcessesExited\":true}\n", scenario, registered, survivor_count, timeout ? "true" : "false", race ? 2 : 0, (unsigned long long)action_duration, exited);
    return 0;
}

int main(int argc, char **argv) {
    require(signal(SIGPIPE, SIG_IGN) != SIG_ERR, "ignore-pipe-signal");
    if (argc == 3 && strcmp(argv[1], "worker") == 0) worker(strcmp(argv[2], "timeout-bootout") == 0);
    require(argc == 4, "controller-arguments");
    return controller(argv[1], argv[2], argv[3]);
}
