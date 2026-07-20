import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser'; 

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      // 1. Allow mobile apps, Postman, or server-to-server calls where origin is undefined
      if (!origin) {
        return callback(null, true);
      }

      // 2. Fallback check for local environments
      if (
        origin.includes('localhost') || 
        origin.includes('127.0.0.1') || 
        origin.startsWith('http://10.') || 
        origin.startsWith('http://192.')
      ) {
        return callback(null, true);
      }

      // 3. Match your Vercel URL patterns (Handles preview links and www variants)
      if (
        origin.includes('aviorego-frontend.vercel.app') ||
        origin.includes('aviorego') // Broad check to match preview branches if needed
      ) {
        return callback(null, true);
      }

      // 4. Custom domain placeholder (If you purchase aviorego.com later, add it here)
      // if (origin.includes('yourcustomdomain.com')) return callback(null, true);

      // If it doesn't match any of the safe zones, print it out explicitly to Render logs before blocking
      console.error(`[CORS Blocked]: Request coming from unauthorized origin -> ${origin}`);
      return callback(new Error('Blocked by CORS policy'));
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
  
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Aviorè Go Engine listening across network on port: ${port}`);
}
bootstrap();