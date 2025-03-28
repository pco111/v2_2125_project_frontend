#!/bin/bash

# Exit on any error
set -e

# Check if Conda is installed
if ! command -v conda &> /dev/null; then
    echo "Conda not found. Please install Miniconda or Anaconda first."
    echo "Download from: https://docs.conda.io/en/latest/miniconda.html"
    exit 1
fi

# Initialize Conda for the current shell session
echo "Initializing Conda..."
conda init bash
source ~/.bash_profile  # Source the shell configuration to apply conda init changes
# Alternatively, you can use: source $(conda info --base)/etc/profile.d/conda.sh

# Create and activate Conda environment
echo "Setting up Conda environment..."
conda create -n bert_env python=3.10 -y
conda activate bert_env

# Install Python dependencies
echo "Installing Python dependencies..."
conda install -c conda-forge transformers=4.41.2 huggingface_hub=0.23.4 -y
conda install -c pytorch pytorch=2.3.1 -y

# Check if package.json exists, if not exit with an error
if [ ! -f package.json ]; then
    echo "Error: package.json not found in the current directory."
    echo "Please ensure package.json exists and contains the required dependencies."
    exit 1
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Start the Node.js server in the background
echo "Starting Node.js server..."
node server.js &

# Start the React app
echo "Starting React app..."
npm start

echo "App should be running at http://localhost:3000"