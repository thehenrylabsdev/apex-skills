package com.thehenrylabs.apexledger;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.web.bind.annotation.RestController;

class ModularityAndArchitectureTest {

    private final JavaClasses importedClasses = new ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("com.thehenrylabs.apexledger");

    @Test
    void verifiesSpringModulithBoundedContextsHaveNoCycles() {
        ApplicationModules modules = ApplicationModules.of(ApexLedgerApplication.class);
        modules.verify();
    }

    @Test
    void catalogAndSettlementMustNeverDependOnOrderingModule() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "com.thehenrylabs.apexledger.catalog..",
                "com.thehenrylabs.apexledger.settlement.."
            )
            .should()
            .dependOnClassesThat()
            .resideInAPackage("com.thehenrylabs.apexledger.ordering..")
            .check(importedClasses);
    }

    @Test
    void jpaEntitiesMustDeclareExplicitTableAnnotation() {
        classes()
            .that()
            .areAnnotatedWith(Entity.class)
            .should()
            .beAnnotatedWith(Table.class)
            .check(importedClasses);
    }

    @Test
    void restControllersMustResideInOrderingBoundary() {
        classes()
            .that()
            .areAnnotatedWith(RestController.class)
            .should()
            .resideInAPackage("com.thehenrylabs.apexledger.ordering..")
            .check(importedClasses);
    }
}
