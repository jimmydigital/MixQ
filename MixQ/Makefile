# Makefile for MixQ - Briefcase-packaged Flask app

# Default target (run when you type 'make')
all: lint test build

# Linting (code style check + auto-format)
lint:
	flake8 src/MixQ

# Run in development mode (opens browser or webview)
dev:
	briefcase dev

test:  ## Run basic smoke tests (Flask server responds)
	@echo "Running smoke test on Flask server..."
	@python -c "import requests; \
		r = requests.get('http://127.0.0.1:8085/current_track', timeout=5); \
		print('OK' if r.status_code == 200 else 'FAIL:', r.status_code)" || echo "FAIL: Server not running or unreachable"

# Test locally (run Flask server outside Briefcase)
test-local:
	python src/MixQ/app.py

# Create app structure (re-run if deps change)
create:
	briefcase create macOS

# Build the macOS app bundle
build:
	briefcase build macOS

# Run the built macOS app
run:
	briefcase run macOS

# Package for distribution (creates DMG)
package:
	briefcase package macOS

# Clean build artifacts (use before re-create)
clean:
	rm -rf build/ dist/

# Full rebuild (clean + create + build + run)
rebuild: clean create build run

# Help (list targets)
help:
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

