package com.thehenrylabs.apexledger.settlement;

import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface SettlementMapper {

    LedgerPostingEntryDto toDto(LedgerPostingEntity entity);
}
