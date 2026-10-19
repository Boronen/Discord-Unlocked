#!/bin/sh
set -eu
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec python3 "$directory/Setup.py" install "$@"
