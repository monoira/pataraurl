import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1791543951468 implements MigrationInterface {
  name = 'Init1791543951468';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_role_enum" AS ENUM('OWNER', 'ADMIN', 'MEMBER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "role" "public"."user_role_enum" NOT NULL DEFAULT 'MEMBER', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "password" character varying NOT NULL, "refreshTokenHash" text, "refreshTokenExpiresAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shorten" ("id" SERIAL NOT NULL, "url" character varying NOT NULL, "shortCode" character varying NOT NULL, "accessCount" integer NOT NULL DEFAULT '0', "userId" integer, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_28d285570813a596652305b2e29" UNIQUE ("shortCode"), CONSTRAINT "PK_f43226bede2b1ff5f2e2a45d0ec" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "shorten" ADD CONSTRAINT "FK_6644b5ca66fed5a7f271c50b945" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shorten" DROP CONSTRAINT "FK_6644b5ca66fed5a7f271c50b945"`,
    );
    await queryRunner.query(`DROP TABLE "shorten"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
  }
}
