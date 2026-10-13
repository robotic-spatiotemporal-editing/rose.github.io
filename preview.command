#!/bin/zsh
# RoSE local preview launcher for macOS.
set -eu

cd "${0:A:h}"

preview_port=8000
if curl -fsS --max-time 2 "http://127.0.0.1:${preview_port}/preview.command" | grep -Fq 'RoSE local preview launcher for macOS'; then
  open "http://localhost:${preview_port}/"
  print "RoSE is already running at http://localhost:${preview_port}/"
  exit 0
fi

while lsof -nP -iTCP:"${preview_port}" -sTCP:LISTEN -t >/dev/null; do
  preview_port=$((preview_port + 1))
done

python3 -m http.server "${preview_port}" --bind 127.0.0.1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

for attempt in {1..30}; do
  if curl -fsS --max-time 1 "http://127.0.0.1:${preview_port}/" >/dev/null; then
    open "http://localhost:${preview_port}/"
    print "RoSE preview: http://localhost:${preview_port}/"
    print 'Keep this Terminal window open while previewing. Close it to stop the server.'
    wait "$server_pid"
    exit $?
  fi
  sleep 0.2
done

print -u2 'Could not start the RoSE preview server.'
exit 1
