console.log('Testing module installation...');

try {
  const express = require('express');
  console.log('✅ Express loaded');
  
  const multer = require('multer');
  console.log('✅ Multer loaded');
  
  const exceljs = require('exceljs');
  console.log('✅ ExcelJS loaded');
  
  const puppeteer = require('puppeteer');
  console.log('✅ Puppeteer loaded');
  
  console.log('\n🎉 All modules loaded successfully!');
  console.log('You can now run: node server.js');
  
} catch (error) {
  console.error('❌ Error loading modules:', error.message);
  console.log('\nTry running: npm install');
}