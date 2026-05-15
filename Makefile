SHELL := /usr/bin/env bash

.PHONY: install typecheck test build clean

install:
	bun install

typecheck:
	bun run typecheck

test:
	bun test

build:
	bun run build

clean:
	rm -rf dist
