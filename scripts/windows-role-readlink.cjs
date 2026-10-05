// This synchronous preload targets the bundled Node 22.23.3 runtime.
const fs = process.getBuiltinModule("fs");
const { syncBuiltinESMExports } = process.getBuiltinModule("module");
const { getSystemErrorMap } = process.getBuiltinModule("util");

// Build-process-only compatibility. AppContainer cannot query DOS volume names;
// readlink may report EPERM even for a regular file. Webpack/NFT expect EINVAL
// for non-links. Never reinterpret a link or a failed metadata check.
if (process.platform === "win32" && process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1") {
  const originalReadlink = fs.readlink;
  const originalSync = fs.readlinkSync;
  const originalPromise = fs.promises.readlink;
  const invalidArgument = [...getSystemErrorMap()].find(([, [name]]) => name === "EINVAL")[0];
  function nonLinkError(error, file) {
    if (error?.code !== "EPERM" && error?.code !== "EACCES") return error;
    try {
      if (fs.lstatSync(file).isSymbolicLink()) return error;
    } catch {
      return error;
    }
    return Object.assign(new Error("EINVAL: invalid argument, readlink", { cause: error }), {
      code: "EINVAL", errno: invalidArgument, syscall: "readlink", path: error.path,
    });
  }
  fs.readlinkSync = function (file, ...options) {
    try { return originalSync.call(this, file, ...options); }
    catch (error) { throw nonLinkError(error, file); }
  };
  fs.readlink = function (file, options, callback) {
    if (typeof options === "function") { callback = options; options = undefined; }
    if (typeof callback !== "function") return originalReadlink.apply(this, arguments);
    return originalReadlink.call(this, file, options, (error, target) => callback(error ? nonLinkError(error, file) : null, target));
  };
  fs.promises.readlink = async function (file, ...options) {
    try { return await originalPromise.call(this, file, ...options); }
    catch (error) { throw nonLinkError(error, file); }
  };
  syncBuiltinESMExports();
}
