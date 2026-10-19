#!/bin/bash
# start.sh <item> <iters> <games> <sampled> <seed> [init]
cd "$(dirname "$0")"
nohup node train.js "$@" > "run_$1${TAG}.out" 2>&1 &
