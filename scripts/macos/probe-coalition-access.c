#include <dlfcn.h>
#include <errno.h>
#include <libproc.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>

enum { RESOURCE = 0, JETSAM = 1, COALITION_TYPES = 2, PID_COALITION_INFO = 20, CREATE_TYPE_SHIFT = 4 };

struct coalition_membership {
    uint64_t ids[COALITION_TYPES];
    uint64_t reserved[3];
};

struct child_observation {
    struct coalition_membership membership;
    bool session_leader;
};

typedef int (*create_coalition_fn)(uint64_t *, uint32_t);
typedef int (*close_coalition_fn)(uint64_t, uint32_t);
typedef int (*set_coalition_fn)(const posix_spawnattr_t *, uint64_t, int, int);

extern char **environ;

static void require(bool condition, const char *stage) {
    if (!condition) {
        fprintf(stderr, "coalition probe failed: %s; errno=%d\n", stage, errno);
        exit(1);
    }
}

static struct coalition_membership membership(pid_t process) {
    struct coalition_membership result = {0};
    int bytes = proc_pidinfo(process, PID_COALITION_INFO, 0, &result, sizeof(result));
    require(bytes == (int)sizeof(result), "membership query");
    require(result.ids[RESOURCE] != 0 && result.ids[JETSAM] != 0, "membership identifiers");
    return result;
}

static void write_observation(int output) {
    struct child_observation observation = {0};
    observation.membership = membership(getpid());
    observation.session_leader = getsid(0) == getpid() && getpgrp() == getpid();
    require(write(output, &observation, sizeof(observation)) == (ssize_t)sizeof(observation), "child observation");
}

static void read_observation(int input, struct child_observation *observation) {
    size_t offset = 0;
    while (offset < sizeof(*observation)) {
        ssize_t bytes = read(input, (char *)observation + offset, sizeof(*observation) - offset);
        if (bytes < 0 && errno == EINTR) continue;
        require(bytes > 0, "read child observation");
        offset += (size_t)bytes;
    }
}

static void reap_child(pid_t child) {
    int status = 0;
    pid_t result;
    do { result = waitpid(child, &status, 0); } while (result < 0 && errno == EINTR);
    require(result == child && WIFEXITED(status) && WEXITSTATUS(status) == 0, "child reaped");
}

static void inherited_membership(const char *binary, const struct coalition_membership *parent) {
    int channel[2];
    require(pipe(channel) == 0, "observation pipe");
    pid_t child = fork();
    require(child >= 0, "fork control");
    if (child == 0) {
        alarm(5);
        close(channel[0]);
        require(setsid() == getpid(), "setsid control");
        write_observation(channel[1]);
        char descriptor[24];
        snprintf(descriptor, sizeof(descriptor), "%d", channel[1]);
        execl(binary, binary, "--child", descriptor, (char *)NULL);
        _exit(1);
    }
    close(channel[1]);
    struct child_observation before_exec = {0}, after_exec = {0};
    read_observation(channel[0], &before_exec);
    read_observation(channel[0], &after_exec);
    close(channel[0]);
    reap_child(child);
    require(before_exec.session_leader && after_exec.session_leader, "detached session preserved");
    require(memcmp(parent->ids, before_exec.membership.ids, sizeof(parent->ids)) == 0, "fork inheritance");
    require(memcmp(parent->ids, after_exec.membership.ids, sizeof(parent->ids)) == 0, "exec inheritance");
}

static void spawn_probe(set_coalition_fn set_coalition, uint64_t coalition, int type) {
    posix_spawnattr_t attributes;
    require(posix_spawnattr_init(&attributes) == 0, "spawn attributes");
    int attribute_result = set_coalition(&attributes, coalition, type, 0);
    int spawn_result = -1;
    bool reaped = false;
    if (attribute_result == 0) {
        pid_t child = 0;
        char *arguments[] = {"/usr/bin/true", NULL};
        spawn_result = posix_spawn(&child, arguments[0], NULL, &attributes, arguments, environ);
        if (spawn_result == 0) {
            reap_child(child);
            reaped = true;
        }
    }
    require(posix_spawnattr_destroy(&attributes) == 0, "destroy spawn attributes");
    printf("{\"type\":\"%s\",\"target\":\"current-membership\",\"attributeResult\":%d,\"spawnAttempted\":%s,\"spawnResult\":%d,\"childReaped\":%s}",
        type == RESOURCE ? "resource" : "jetsam", attribute_result,
        attribute_result == 0 ? "true" : "false", spawn_result, reaped ? "true" : "false");
}

static void creation_probe(create_coalition_fn create_coalition, close_coalition_fn terminate_coalition,
    close_coalition_fn reap_coalition, const struct coalition_membership *current, int type) {
    uint64_t created = 0;
    uint32_t flags = (uint32_t)type << CREATE_TYPE_SHIFT;
    errno = 0;
    int result = create_coalition(&created, flags);
    int create_errno = errno;
    int terminate_result = -1, terminate_errno = 0, reap_result = -1, reap_errno = 0;
    if (result == 0) {
        require(created != 0 && created != current->ids[RESOURCE] && created != current->ids[JETSAM], "new coalition identity");
        errno = 0;
        terminate_result = terminate_coalition(created, 0);
        terminate_errno = errno;
        if (terminate_result == 0) {
            errno = 0;
            reap_result = reap_coalition(created, 0);
            reap_errno = errno;
        }
    }
    printf("{\"type\":\"%s\",\"flags\":%u,\"result\":%d,\"errno\":%d,\"idAssigned\":%s,\"emptyOwnedCleanup\":",
        type == RESOURCE ? "resource" : "jetsam", flags, result, create_errno, created != 0 ? "true" : "false");
    if (result == 0) {
        printf("{\"terminateResult\":%d,\"terminateErrno\":%d,\"reapResult\":%d,\"reapErrno\":%d}",
            terminate_result, terminate_errno, reap_result, reap_errno);
    } else {
        printf("null");
    }
    printf("}");
}

int main(int argc, char **argv) {
    alarm(10);
    require(getuid() != 0 && geteuid() != 0 && getuid() == geteuid(), "ordinary user required");
    if (argc == 3 && strcmp(argv[1], "--child") == 0) {
        int descriptor = atoi(argv[2]);
        require(descriptor > STDERR_FILENO, "observation descriptor");
        write_observation(descriptor);
        close(descriptor);
        return 0;
    }
    require(argc == 1, "arguments");
    create_coalition_fn create_coalition = (create_coalition_fn)dlsym(RTLD_DEFAULT, "coalition_create");
    close_coalition_fn terminate_coalition = (close_coalition_fn)dlsym(RTLD_DEFAULT, "coalition_terminate");
    close_coalition_fn reap_coalition = (close_coalition_fn)dlsym(RTLD_DEFAULT, "coalition_reap");
    set_coalition_fn set_coalition = (set_coalition_fn)dlsym(RTLD_DEFAULT, "posix_spawnattr_setcoalition_np");
    require(create_coalition && terminate_coalition && reap_coalition && set_coalition, "coalition symbols");
    struct coalition_membership current = membership(getpid());
    struct coalition_membership parent = membership(getppid());
    inherited_membership(argv[0], &current);
    pid_t child = 0;
    char *arguments[] = {"/usr/bin/true", NULL};
    require(posix_spawn(&child, arguments[0], NULL, NULL, arguments, environ) == 0, "ordinary spawn control");
    reap_child(child);
    printf("{\"ordinaryUser\":true,\"symbolsResolved\":true,\"querySucceeded\":true,\"resourceSharedWithParent\":%s,\"jetsamSharedWithParent\":%s,\"forkSetsidExecPreservedMembership\":true,\"ordinarySpawnSucceeded\":true,\"controlChildrenReaped\":2,\"spawn\":[",
        current.ids[RESOURCE] == parent.ids[RESOURCE] ? "true" : "false",
        current.ids[JETSAM] == parent.ids[JETSAM] ? "true" : "false");
    for (int type = 0; type < COALITION_TYPES; type++) {
        if (type) printf(",");
        spawn_probe(set_coalition, current.ids[type], type);
    }
    printf("],\"creation\":[");
    for (int type = 0; type < COALITION_TYPES; type++) {
        if (type) printf(",");
        creation_probe(create_coalition, terminate_coalition, reap_coalition, &current, type);
    }
    printf("],\"existingCoalitionTerminationAttempted\":false,\"liveCoalitionTerminationTested\":false}\n");
    return 0;
}
