# Deployment Guide

Complete step-by-step instructions for deploying the Live Camera Stream application to various cloud platforms.

## Table of Contents
1. [Local Development](#local-development)
2. [Heroku Deployment](#heroku-deployment)
3. [AWS Deployment](#aws-deployment)
4. [DigitalOcean Deployment](#digitalocean-deployment)
5. [Docker Deployment](#docker-deployment)
6. [Vercel + Express Deployment](#vercel--express-deployment)

---

## Local Development

### Prerequisites
- Node.js 14+ and npm
- Git
- Modern web browser

### Setup

1. **Clone or download the project**

2. **Start Backend**
```bash
cd backend
npm install
npm start
# Runs on http://localhost:5000
```

3. **Start Frontend (new terminal)**
```bash
cd frontend
npm install
npm start
# Runs on http://localhost:3000
```

4. **Access Application**
- Open `http://localhost:3000` in your browser
- Camera capture works on localhost without HTTPS

---

## Heroku Deployment

### Deploy Backend to Heroku

#### Step 1: Create Heroku Account
- Go to [heroku.com](https://www.heroku.com)
- Sign up for free account

#### Step 2: Install Heroku CLI
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Linux
curl https://cli-assets.heroku.com/install.sh | sh

# Windows
# Download from https://cli-assets.heroku.com/heroku-x64.exe
```

#### Step 3: Create and Deploy Backend
```bash
cd backend

# Login to Heroku
heroku login

# Create app
heroku create your-app-name-backend

# Add Procfile
echo "web: npm start" > Procfile

# Add .gitignore if not present
echo "node_modules/" >> .gitignore

# Commit and push
git add .
git commit -m "Deploy to Heroku"
git push heroku main
```

#### Step 4: Configure Environment
```bash
heroku config:set -a your-app-name-backend \
  PORT=5000 \
  NODE_ENV=production \
  CORS_ORIGIN=https://your-frontend-domain.com
```

#### Step 5: Verify
```bash
heroku logs -a your-app-name-backend
# Should see: "🎥 Live Camera Stream Server running on..."
```

**Backend URL**: `https://your-app-name-backend.herokuapp.com`

### Deploy Frontend to Vercel

#### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

#### Step 2: Deploy
```bash
cd frontend

# Login and deploy
vercel --prod \
  --env REACT_APP_BACKEND_URL=https://your-app-name-backend.herokuapp.com
```

#### Step 3: Verify
- Check Vercel dashboard for deployment
- Frontend URL will be provided

---

## AWS Deployment

### Deploy Backend to AWS EC2

#### Step 1: Launch EC2 Instance
1. Go to AWS Console → EC2
2. Click "Launch Instance"
3. Select "Ubuntu Server 20.04 LTS"
4. Choose instance type (t2.micro for free tier)
5. Configure security group:
   - Allow HTTP (port 80)
   - Allow HTTPS (port 443)
   - Allow SSH (port 22)
6. Launch and download key pair (.pem file)

#### Step 2: Connect to Instance
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@your-instance-public-ip
```

#### Step 3: Install Dependencies
```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install PM2
sudo npm install -g pm2
```

#### Step 4: Deploy Application
```bash
# Clone repository
git clone your-repo-url

# Navigate and install
cd your-repo/backend
npm install

# Start with PM2
pm2 start server.js --name camera-stream
pm2 startup
pm2 save

# Verify
pm2 status
```

#### Step 5: Configure Nginx
```bash
# Create config
sudo nano /etc/nginx/sites-available/default
```

Add content:
```nginx
upstream backend {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

#### Step 6: SSL Certificate (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
sudo certbot renew --dry-run
```

#### Step 7: Create Nginx HTTPS Config
```nginx
upstream backend {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Deploy Frontend to AWS S3 + CloudFront

#### Step 1: Create S3 Bucket
```bash
aws s3api create-bucket \
  --bucket your-app-name \
  --region us-east-1
```

#### Step 2: Build React App
```bash
cd frontend
REACT_APP_BACKEND_URL=https://your-domain.com npm run build
```

#### Step 3: Upload to S3
```bash
aws s3 sync build/ s3://your-app-name/ --delete
```

#### Step 4: Create CloudFront Distribution
1. AWS Console → CloudFront
2. Create distribution
3. Origin domain: S3 bucket
4. Default root object: index.html
5. Create distribution

---

## DigitalOcean Deployment

### Step 1: Create Droplet
1. Go to [digitalocean.com](https://www.digitalocean.com)
2. Create Droplet
3. Select Ubuntu 20.04 LTS
4. Choose $5/month (1GB RAM)
5. Create droplet

### Step 2: SSH Access
```bash
ssh root@your-droplet-ip
```

### Step 3: Install Dependencies
```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs nginx certbot python3-certbot-nginx
npm install -g pm2
```

### Step 4: Deploy Backend
```bash
git clone your-repo-url
cd your-repo/backend
npm install
pm2 start server.js --name camera-stream
pm2 startup
pm2 save
```

### Step 5: Configure Nginx
```bash
nano /etc/nginx/sites-available/default
```

Add Nginx config (see AWS section above)

```bash
systemctl restart nginx
```

### Step 6: Enable SSL
```bash
certbot certonly --nginx -d your-domain.com
```

### Step 7: Update DNS
1. Point your domain to Droplet IP
2. Wait for DNS propagation (can take 24 hours)

---

## Docker Deployment

### Create Docker Files

**backend/Dockerfile**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

**frontend/Dockerfile**
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG REACT_APP_BACKEND_URL=http://localhost:5000
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**docker-compose.yml**
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - PORT=5000
      - NODE_ENV=production
      - CORS_ORIGIN=http://localhost:3000
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      args:
        REACT_APP_BACKEND_URL=http://localhost:5000
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: unless-stopped
```

### Run Docker Compose
```bash
docker-compose up -d
```

**Access:**
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

### Deploy to Docker Hub
```bash
docker login
docker tag your-app-name username/camera-stream:latest
docker push username/camera-stream:latest
```

---

## Vercel + Express Deployment

### Using Vercel for Full Stack

#### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

#### Step 2: Deploy Command
```bash
vercel --prod \
  --region iad \
  --env REACT_APP_BACKEND_URL=your-backend-url
```

**Note:** Vercel serverless has limitations for long-lived connections. For persistent streaming, use traditional VPS (AWS EC2, DigitalOcean) instead.

---

## Troubleshooting

### Heroku App Not Starting
```bash
heroku logs -a your-app-name --tail
# Check for errors in logs
```

### EC2 Connection Refused
```bash
# Check security group allows port 80/443
sudo systemctl status nginx
sudo systemctl restart nginx
```

### DOM Unavailable Errors
- Ensure frontend is deployed to public URL
- Check CORS configuration in backend
- Verify backend URL in frontend .env

### HTTPS Certificate Issues
```bash
# Test certificate
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal
```

---

## Performance Monitoring

### Monitor Backend
```bash
# Via PM2
pm2 monit

# Via SSH
ssh user@server "pm2 status"
```

### Monitor with New Relic
```bash
npm install newrelic
# Add to server.js top: require('newrelic');
```

### Check Backend Logs
```bash
# Heroku
heroku logs -a your-app-name --tail

# EC2/DigitalOcean
pm2 logs camera-stream

# Docker
docker logs container-id
```

---

## Cost Estimation

| Platform | Tier | Cost/Month | Notes |
|----------|------|-----------|-------|
| Heroku | Basic | $7-14 | Simple, easy deployment |
| AWS EC2 | t2.micro | $0-9.50 | Free tier available |
| DigitalOcean | Basic | $5 | Simple, reliable |
| Vercel | Hobby | $0 | Frontend only |
| Netlify | Hobby | $0 | Frontend only |

**Recommended for starting:** DigitalOcean + Vercel ($5/month)

---

## Next Steps

1. Point your domain to deployed server
2. Enable HTTPS with SSL certificate
3. Add authentication (optional)
4. Set up monitoring and alerts
5. Configure auto-scaling if needed
6. Set up CI/CD pipeline for automatic deployments
