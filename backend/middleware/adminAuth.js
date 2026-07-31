module.exports = function adminAuth(req, res, next) {
  const username = req.headers.username;
  const password = req.headers.password;

  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "admin123";

  if (username === expectedUser && password === expectedPass) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized" });
};
