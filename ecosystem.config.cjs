module.exports = {
  apps: [
    {
      name: "alpha-snipes-paper",
      script: "npx",
      args: "tsx index.ts",
      env: {
        NODE_ENV: "production"
      },
      // Restart if crashes
      autorestart: true,
      // Max memory before restart (1GB)
      max_memory_restart: "1G",
      // Error log
      error_file: "./logs/err.log",
      // Out log
      out_file: "./logs/out.log",
      // Time format for logs
      time: true,
      // Merge logs from cluster instances
      merge_logs: true,
    }
  ]
};

