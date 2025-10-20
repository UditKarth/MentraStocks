# 🚀 Railway Deployment Guide for StockTracker App

This guide will help you deploy your StockTracker app to Railway.

## 📋 Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Your code should be in a GitHub repository
3. **Environment Variables**: You'll need your AugmentOS API key and package name

## 🔧 Required Environment Variables

Set these in your Railway project settings:

### **Required Variables:**
```bash
PACKAGE_NAME=your-stocktracker-app-name
AUGMENTOS_API_KEY=your-augmentos-api-key-here
NODE_ENV=production
```

### **Optional Variables:**
```bash
PORT=3000
DEBUG=false
FMP_API_KEY=your-fmp-api-key-here
```

## 🚀 Deployment Steps

### **1. Connect Your Repository**

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your StockTracker repository
5. Railway will automatically detect it's a Node.js project

### **2. Configure Environment Variables**

1. In your Railway project dashboard, go to "Variables" tab
2. Add the required environment variables:
   - `PACKAGE_NAME`: Your app's package name
   - `AUGMENTOS_API_KEY`: Your AugmentOS API key
   - `NODE_ENV`: Set to `production`

### **3. Deploy**

1. Railway will automatically build and deploy your app
2. The build process will:
   - Install dependencies
   - Run `npm run build` to compile TypeScript
   - Start the app using `node railway-start.js`

### **4. Get Your App URL**

1. Once deployed, Railway will provide a public URL
2. Your app will be available at: `https://your-app-name.railway.app`

## 🔍 Health Check Endpoints

Your app provides these endpoints for monitoring:

- **Health Check**: `GET /health`
- **Status**: `GET /api/status`
- **Memory Usage**: `GET /api/memory`

## 📊 Monitoring

### **Railway Dashboard**
- View logs in real-time
- Monitor resource usage
- Check deployment status

### **App Endpoints**
```bash
# Health check
curl https://your-app-name.railway.app/health

# App status
curl https://your-app-name.railway.app/api/status

# Memory usage
curl https://your-app-name.railway.app/api/memory
```

## 🔧 Troubleshooting

### **Common Issues:**

1. **Build Fails**
   - Check that all dependencies are in `package.json`
   - Ensure TypeScript compilation succeeds locally

2. **App Won't Start**
   - Verify environment variables are set correctly
   - Check logs for missing API keys

3. **Port Issues**
   - Railway automatically sets `PORT` environment variable
   - Your app should use `process.env.PORT || 80`

### **Debug Commands:**

```bash
# Check build logs
railway logs

# View environment variables
railway variables

# Restart deployment
railway up
```

## 🔄 Continuous Deployment

Railway automatically deploys when you push to your main branch:

1. Push changes to GitHub
2. Railway detects the push
3. Automatically rebuilds and deploys
4. Your app is updated with zero downtime

## 📈 Scaling

### **Automatic Scaling**
- Railway automatically scales based on traffic
- No manual configuration needed

### **Resource Limits**
- Free tier: Limited resources
- Pro tier: More resources and custom domains

## 🔐 Security

### **Environment Variables**
- All sensitive data should be in Railway environment variables
- Never commit API keys to your repository

### **HTTPS**
- Railway automatically provides HTTPS
- All traffic is encrypted

## 📞 Support

If you encounter issues:

1. Check Railway logs in the dashboard
2. Verify environment variables are set correctly
3. Test locally with the same environment variables
4. Contact Railway support if needed

## 🎉 Success!

Once deployed, your StockTracker app will be:
- ✅ Running on Railway's infrastructure
- ✅ Automatically scaled
- ✅ Monitored and logged
- ✅ Available via HTTPS
- ✅ Continuously deployed from GitHub

Your app URL will be: `https://your-app-name.railway.app`


