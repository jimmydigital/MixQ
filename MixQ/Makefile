# Makefile for MixQ - Briefcase-packaged Flask app

.PHONY: dev test-local lint test create build run clean sign-app-bin release package help

IDENTITY    = Developer ID Application: JARED TODD WATKINS (A7VW3CXCU3)
TEAM_ID     = A7VW3CXCU3
KC_PROFILE  = briefcase-macOS-$(TEAM_ID)
APP_BUNDLE  = build/MixQ/macos/app/MixQ.app
APP_BIN     = $(APP_BUNDLE)/Contents/MacOS/MixQ

# ─────────────────────────────────────────────
# Development
# ─────────────────────────────────────────────

dev:
	briefcase dev

test-local:
	python src/MixQ/app.py

lint:
	flake8 src/MixQ

test:
	@echo "Running smoke test on Flask server..."
	@python -c "import requests; \
		r = requests.get('http://127.0.0.1:8085/current_track', timeout=5); \
		print('OK' if r.status_code == 200 else 'FAIL:', r.status_code)" || echo "FAIL: Server not running or unreachable"

# ─────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────

create:
	briefcase create macOS

build:
	briefcase build macOS

run:
	briefcase run macOS

clean:
	rm -rf build/ dist/

# ─────────────────────────────────────────────
# Release
# ─────────────────────────────────────────────

# Sign the app binary (Briefcase bug — sign_app doesn't scan Contents/MacOS)
# After `briefcase build`, the Stub has been renamed to MixQ.
sign-app-bin:
	codesign --sign "$(IDENTITY)" --force --options runtime "$(APP_BIN)"

# Version extracted from pyproject.toml
VERSION = $(shell grep '^version' pyproject.toml | head -1 | sed 's/.*= *"//;s/"//')
DMG     = dist/MixQ-$(VERSION).dmg

# Full release:
#   1. clean + create + build     (fresh app bundle — build renames Stub → MixQ)
#   2. sign-app-bin               (sign the main binary that Briefcase misses)
#   3. briefcase package          (signs dylibs/frameworks + app bundle, makes DMG,
#                                  notarizes, staples)
#
# Why sign-app-bin before package: Briefcase's sign_app() scans Contents/Resources
# and Contents/Frameworks but NOT Contents/MacOS. The main binary (MixQ, renamed
# from Stub during build) lives in Contents/MacOS and is missed. When Briefcase
# tries to codesign the outer .app bundle, macOS codesign refuses because of the
# unsigned subcomponent. Pre-signing it fixes this.
release: clean create build sign-app-bin
	@echo "--- Verifying app binary is signed ---"
	codesign --verify --verbose "$(APP_BIN)"
	briefcase package macOS --identity "$(IDENTITY)"
	@echo "✓ Release complete. DMG is in dist/"

# Signed DMG, no notarization (for local testing only — will show damaged on other Macs)
package: clean create build sign-app-bin
	briefcase package macOS --identity "$(IDENTITY)" --no-notarize

# ─────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────

help:
	@echo ""
	@echo "Development:  make dev | make test-local | make lint | make test"
	@echo "Build:        make create | make build | make run | make clean"
	@echo "Release:      make release   (full: clean+build+sign+notarize+dmg)"
	@echo "              make package   (local test only, no notarization)"
	@echo ""
