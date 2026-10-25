import SwiftUI

public struct ApexLedgerRootView: View {
    @State private var uiState = IosCheckoutState()
    @ScaledMetric(relativeTo: .title2) private var cardPadding: CGFloat = 20

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    environmentPickerSection
                    stateBannerSection
                    actionButtonsSection
                }
                .padding(cardPadding)
            }
            .navigationTitle("ApexLedger iOS")
        }
    }

    private var environmentPickerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Deployment Environment", systemImage: "server.rack")
                .font(.headline)
                .foregroundStyle(Color.primary)

            HStack(spacing: 12) {
                ForEach(AppEnvironment.allCases, id: \.rawValue) { env in
                    Button(action: {
                        uiState = IosCheckoutStatechart.reduce(
                            state: uiState,
                            event: .switchEnvironment(env)
                        )
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: uiState.environment == env ? "checkmark.circle.fill" : "circle")
                            Text(env.rawValue)
                                .font(.subheadline.weight(.semibold))
                        }
                        .frame(minWidth: 64, minHeight: 44)
                        .padding(.horizontal, 12)
                    }
                    .accessibilityLabel("Switch to \(env.rawValue) environment")
                }
            }
        }
    }

    private var stateBannerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: iconForPhase(uiState.phase))
                Text("Statechart Phase: \(uiState.phase.rawValue)")
                    .font(.headline)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Current checkout phase \(uiState.phase.rawValue)")

            Text("Endpoint: \(uiState.environment.baseUrl)")
                .font(.caption.monospaced())
        }
    }

    private var actionButtonsSection: some View {
        HStack(spacing: 12) {
            Button(action: {
                uiState = IosCheckoutStatechart.reduce(
                    state: uiState,
                    event: .submitReservation(idempotencyKey: UUID().uuidString)
                )
            }) {
                Label("Reserve Allocation", systemImage: "bolt.shield.fill")
                    .font(.body.weight(.semibold))
                    .frame(minWidth: 160, minHeight: 44)
            }
            .accessibilityLabel("Reserve flash allocation with idempotency key")

            Button(action: {
                uiState = IosCheckoutStatechart.reduce(state: uiState, event: .resetFlow)
            }) {
                Label("Reset", systemImage: "arrow.counterclockwise")
                    .font(.body.weight(.medium))
                    .frame(minWidth: 88, minHeight: 44)
            }
            .accessibilityLabel("Reset checkout statechart")
        }
    }

    private func iconForPhase(_ phase: CheckoutPhase) -> String {
        switch phase {
        case .settled:
            return "checkmark.seal.fill"
        case .rejectedOutOfStock, .expired:
            return "exclamationmark.triangle.fill"
        default:
            return "clock.badge.checkmark"
        }
    }
}
