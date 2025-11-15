#!/bin/bash

# MT4 Bridge Setup Script
# Automates the installation process for MT4 bridge

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     MT4 Bridge Installation Script        ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    echo "Please install Docker Compose first"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js first: https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites met${NC}"
echo ""

# Create .env file if not exists
echo -e "${YELLOW}[2/6] Configuring environment...${NC}"

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env

    # Generate random password
    RANDOM_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-16)

    # Update .env with random password
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/BRIDGE_AUTH_PASSWORD=.*/BRIDGE_AUTH_PASSWORD=${RANDOM_PASSWORD}/" .env
    else
        # Linux
        sed -i "s/BRIDGE_AUTH_PASSWORD=.*/BRIDGE_AUTH_PASSWORD=${RANDOM_PASSWORD}/" .env
    fi

    echo -e "${GREEN}✅ Created .env with random password${NC}"
    echo -e "${BLUE}📝 Password: ${RANDOM_PASSWORD}${NC}"
    echo "Please save this password - you'll need it for configuration"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

echo ""

# Install Node.js dependencies
echo -e "${YELLOW}[3/6] Installing Node.js dependencies...${NC}"

npm install

echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Download ZMQ library
echo -e "${YELLOW}[4/6] Downloading ZeroMQ library for MT4...${NC}"

mkdir -p include libraries

if [ -d "libraries/mql-zmq" ]; then
    echo "ZMQ library already exists, updating..."
    cd libraries/mql-zmq
    git pull
    cd ../..
else
    echo "Cloning ZMQ library..."
    cd libraries
    git clone https://github.com/dingmaotu/mql-zmq.git
    cd ..
fi

# Copy ZMQ headers to include directory
echo "Copying ZMQ headers..."
cp -r libraries/mql-zmq/Include/Zmq/* include/ 2>/dev/null || cp -r libraries/mql-zmq/Include/Zmq include/

echo -e "${GREEN}✅ ZeroMQ library ready${NC}"
echo ""

# Create necessary directories
echo -e "${YELLOW}[5/6] Creating directories...${NC}"

mkdir -p logs
mkdir -p ../mt4-data

echo -e "${GREEN}✅ Directories created${NC}"
echo ""

# Summary
echo -e "${YELLOW}[6/6] Setup complete!${NC}"
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Next Steps                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}1. Start the bridge:${NC}"
echo "   cd .."
echo "   docker-compose -f docker-compose.mt4.yml up -d"
echo ""
echo -e "${GREEN}2. Connect to MT4 via VNC:${NC}"
echo "   Host: localhost:5900"
echo "   Password: mt4bridge2024"
echo ""
echo -e "${GREEN}3. Configure MT4 terminal:${NC}"
echo "   - Login to your broker account"
echo "   - Enable auto-trading (Tools → Options → Expert Advisors)"
echo "   - Attach MT4Bridge EA to any chart"
echo ""
echo -e "${GREEN}4. Test the connection:${NC}"
echo "   cd .."
echo "   npm run test:mt4"
echo ""
echo -e "${BLUE}📖 Full documentation: ${NC}mt4-bridge/README.md"
echo -e "${BLUE}🚀 Quick start guide: ${NC}MT4-SETUP-QUICKSTART.md"
echo ""

# Check if should start services
read -p "Would you like to start the MT4 bridge now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Starting MT4 bridge services...${NC}"
    cd ..
    docker-compose -f docker-compose.mt4.yml up -d

    echo ""
    echo -e "${GREEN}✅ Services started!${NC}"
    echo ""
    echo "Waiting for services to be ready (10 seconds)..."
    sleep 10

    # Test ping
    echo ""
    echo -e "${YELLOW}Testing bridge connection...${NC}"

    if curl -f -s http://localhost:8080/api/v1/ping > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Bridge is responding!${NC}"
        echo ""
        echo -e "${BLUE}Next: Connect to VNC and configure MT4${NC}"
        echo "VNC: vnc://localhost:5900 (password: mt4bridge2024)"
    else
        echo -e "${YELLOW}⚠️  Bridge not responding yet${NC}"
        echo "This is normal - it may take a minute to start"
        echo "Check logs: docker logs -f mt4-bridge-server"
    fi
else
    echo ""
    echo -e "${BLUE}You can start the bridge later with:${NC}"
    echo "docker-compose -f docker-compose.mt4.yml up -d"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Installation Complete! 🎉              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
