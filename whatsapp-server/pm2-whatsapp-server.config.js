module.exports = {
  apps: [
    {
      name: "whatsapp-server",
      script: "npm",
      args: "start",
      cwd: "/app",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
