// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ApexLedgerIOS",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "ApexLedgerIOS",
            targets: ["ApexLedgerIOS"]
        )
    ],
    targets: [
        .target(
            name: "ApexLedgerIOS"
        ),
        .testTarget(
            name: "ApexLedgerIOSTests",
            dependencies: ["ApexLedgerIOS"]
        )
    ]
)
