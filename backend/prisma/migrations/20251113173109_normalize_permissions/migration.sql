/*
  Warnings:

  - A unique constraint covering the columns `[serviceId,method,path]` on the table `Endpoint` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[routeVersion,xRoadInstance,memberClass,memberCode,subsystemCode]` on the table `Provider` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[providerId,serviceCode]` on the table `Service` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."Provider" DROP CONSTRAINT "Provider_userId_fkey";

-- DropIndex
DROP INDEX "public"."Endpoint_userId_serviceId_method_path_key";

-- DropIndex
DROP INDEX "public"."Provider_userId_routeVersion_xRoadInstance_memberClass_memb_key";

-- DropIndex
DROP INDEX "public"."Service_userId_providerId_serviceCode_key";

-- AlterTable
ALTER TABLE "Endpoint" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Provider" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Endpoint_serviceId_method_path_key" ON "Endpoint"("serviceId", "method", "path");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_routeVersion_xRoadInstance_memberClass_memberCode__key" ON "Provider"("routeVersion", "xRoadInstance", "memberClass", "memberCode", "subsystemCode");

-- CreateIndex
CREATE UNIQUE INDEX "Service_providerId_serviceCode_key" ON "Service"("providerId", "serviceCode");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
