import 'reflect-metadata';
import {
  ClassSerializerInterceptor,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.getOrThrow<string>('CORS_ORIGIN'),
    credentials: true,
  });

  // versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // graceful shutdown on SIGTERM
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      // strips out properties not defined with decorators in the DTO
      whitelist: true,
      // throws a 400 error if any non-whitelisted properties are present
      forbidNonWhitelisted: true,
      // automatically does type conversions. eg:
      // by default 'id' is string even with id: number,
      // but with transform: true it will convert to number automatically
      // findOne(@Param('id') id: number)
      transform: true,
      // automatically converts values, like dto values, to their types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.use(cookieParser());

  // excludes properties marked with @exclude() decorator in DTOs from serialized responses
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // OpenAPI
  const config = new DocumentBuilder()
    .setTitle('server example')
    .setDescription('server API description')
    .setVersion('1.0')
    .build();
  const options: SwaggerDocumentOptions = {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  };
  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, options);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(configService.getOrThrow<number>('PORT'));
}
await bootstrap();
