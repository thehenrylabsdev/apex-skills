package com.thehenrylabs.apexledger.catalog;

import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface CatalogMapper {

    FlashCampaignDto toDto(FlashCampaignEntity entity);
}
