/*
  Warnings:

  - A unique constraint covering the columns `[routeVersion,xRoadInstance,memberClass,memberCode,subsystemCode]` on the table `Provider` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `routeVersion` to the `Provider` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Provider_xRoadInstance_memberClass_memberCode_subsystemCode_key";

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "routeVersion" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Provider_routeVersion_xRoadInstance_memberClass_memberCode__key" ON "Provider"("routeVersion", "xRoadInstance", "memberClass", "memberCode", "subsystemCode");
