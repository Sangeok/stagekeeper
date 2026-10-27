#include <time.h>
#include <unistd.h>

static void pause_briefly(void) {
    struct timespec delay = { 0, 2000000 };
    nanosleep(&delay, NULL);
}

int main(void) {
    time_t started = time(NULL);
    for (;;) {
        if (time(NULL) - started > 120) return 0;
        pid_t child = fork();
        if (child > 0) _exit(0);
        if (child == 0) setsid();
        pause_briefly();
    }
}
