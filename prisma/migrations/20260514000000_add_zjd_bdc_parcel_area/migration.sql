-- 为宅基地档案新增宗地面积字段
ALTER TABLE `zjd_bdc`
  ADD COLUMN `parcelArea` FLOAT NULL AFTER `area`;
