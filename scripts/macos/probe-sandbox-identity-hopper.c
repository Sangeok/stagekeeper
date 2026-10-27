#include <fcntl.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>

static void pause_briefly(void) {
    struct timespec delay = { 0, 2000000 };
    nanosleep(&delay, NULL);
}

static void beat(const char *path, unsigned long hops) {
    char text[32];
    int length = snprintf(text, sizeof(text), "%lu\n", hops);
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (fd < 0) return;
    if (length > 0 && write(fd, text, (size_t)length) < 0) length = 0;
    close(fd);
}

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    time_t started = time(NULL);
    unsigned long hops = 0;
    for (;;) {
        if (time(NULL) - started > 120) return 0;
        pid_t child = fork();
        if (child > 0) _exit(0);
        if (child == 0) {
            setsid();
            if (++hops % 20 == 0) beat(argv[1], hops);
        }
        pause_briefly();
    }
}
