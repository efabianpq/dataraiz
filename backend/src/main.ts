import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // Prefijo /api para toda la API REST; health queda en la raíz para healthchecks.
  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('DataRaíz API')
    .setDescription(
      'API REST de apoyo a decisiones de inversión inmobiliaria (AMB). ' +
        'El backend solo lee resultados precalculados; la optimización NSGA-II ' +
        'se delega al motor analytics (FastAPI).',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`DataRaíz backend escuchando en el puerto ${port}`);
  console.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}
bootstrap();
