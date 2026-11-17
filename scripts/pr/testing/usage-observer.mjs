if (process.argv[2] === "large") process.stdout.write(Buffer.alloc(17 * 1024 * 1024));
else process.stdout.write("ready\n");
setInterval(() => {}, 1000);
