// pm2 process file — runs the backend in production mode.
// Start:   pm2 start scripts/deploy/ecosystem.config.cjs
// Reload:  pm2 reload ads-mangment-backend
// Logs:    pm2 logs ads-mangment-backend

module.exports = {
  apps: [
    {
      name: 'ads-mangment-backend',
      cwd: '/opt/ads-mangment/backend',
      script: 'server.js',
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      out_file: '/var/log/ads-mangment/backend.out.log',
      error_file: '/var/log/ads-mangment/backend.err.log',
      merge_logs: true,
      time: true
    }
  ]
};
