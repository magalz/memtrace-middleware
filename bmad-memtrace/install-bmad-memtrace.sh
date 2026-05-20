#!/bin/bash
# install-bmad-memtrace.sh
# Installation script for BMad Memtrace Integration
# Aggressively cleans up the repository clone, preserving only necessary files.

set -e

echo "Starting BMad Memtrace standalone environment setup..."

INSTALL_DIR="bmad-install"

# Create a safe staging directory
echo "Creating staging directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Move essential files to the staging directory
echo "Copying core files to staging directory..."
[ -d "_bmad" ] && cp -r _bmad "$INSTALL_DIR/"
[ -d ".agents" ] && cp -r .agents "$INSTALL_DIR/"
[ -f "package.json" ] && cp package.json "$INSTALL_DIR/"
[ -f "install-bmad-memtrace.sh" ] && cp install-bmad-memtrace.sh "$INSTALL_DIR/"
# Also copy docs if present
[ -d "docs" ] && cp -r docs "$INSTALL_DIR/"

# Remove explicit non-essential bmad cloned files and .git
echo "Cleaning up legacy clone files and .git..."
rm -rf .git
rm -f README.md LICENSE .gitignore .eslintrc.json tsconfig.json webpack.config.js || true

# Copy files back to the root of the project
echo "Restoring core files to root..."
cp -a "$INSTALL_DIR"/. .

# Remove staging directory
echo "Removing staging directory..."
rm -rf "$INSTALL_DIR"

echo "Cleanup complete! You now have a clean, standalone BMad-Memtrace runtime environment."
