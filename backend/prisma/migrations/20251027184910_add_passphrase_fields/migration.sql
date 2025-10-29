/*
  Warnings:

  - Added the required column `passAuthTag` to the `Certificate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passEncrypted` to the `Certificate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passIv` to the `Certificate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "passAuthTag" BYTEA NOT NULL,
ADD COLUMN     "passEncrypted" BYTEA NOT NULL,
ADD COLUMN     "passIv" BYTEA NOT NULL;
