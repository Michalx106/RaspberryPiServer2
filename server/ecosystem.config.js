module.exports = {
  apps: [
    {
      name: "raspberry-server",
      script: "index.js",
      cwd: "/opt/RaspberryPiServer2/server",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      autorestart: true,
      watch: false,
      max_restarts: 10
    }
  ]
}
