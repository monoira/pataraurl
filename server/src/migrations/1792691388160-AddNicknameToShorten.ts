import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNicknameToShorten1792691388160 implements MigrationInterface {
  name = 'AddNicknameToShorten1792691388160';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shorten" ADD "nickname" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shorten" DROP COLUMN "nickname"`);
  }
}
