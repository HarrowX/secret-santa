export function requestLogger(req, res, next) {
  const started = Date.now()

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'request',
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        duration_ms: Date.now() - started,
      }),
    )
  })

  next()
}
