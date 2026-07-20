import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser'; // 🌟 Import cookie parser

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Mount Cookie Parser Middleware BEFORE CORS and Route definitions
  app.use(cookieParser());

  // 2. Enable Cross-Origin Resource Sharing (CORS)
  app.enableCors({
    origin: (origin, callback) => {
      // In local development, allow any origin to prevent browser handshake failures
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      const allowedOrigins = [
        'http://localhost:3000',
        'http://10.149.182.178:3000',
        'https://your-frontend-domain.vercel.app',
      ].filter(Boolean);

      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 10000;
  
  // --- FIXED FOR MOBILE: Added '0.0.0.0' to open NestJS up to your Wi-Fi network ---
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Aviorè Go Engine listening across network on port: ${port}`);
}
bootstrap();