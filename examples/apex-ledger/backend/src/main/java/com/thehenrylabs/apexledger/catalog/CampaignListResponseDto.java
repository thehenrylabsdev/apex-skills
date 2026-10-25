package com.thehenrylabs.apexledger.catalog;

import java.util.List;

public record CampaignListResponseDto(
    String contractVersion,
    String environment,
    List<FlashCampaignDto> campaigns
) {}
