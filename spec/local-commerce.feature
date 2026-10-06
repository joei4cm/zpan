Feature: Local commerce
  Unlocked self-hosted instances sell storage packages and gift cards locally.
  Stripe Checkout charges the operator's own Stripe account. Gift-card codes
  grant storage quota. Cloud binding, Cloud traffic reports, and licensing
  refresh are not used on these paths.

  @local-commerce/packages-from-catalog @api
  Scenario: The storefront lists locally defined packages
    Given feature unlock is enabled
    And an admin created an active storage package
    When a user lists store packages
    Then the local package is returned and Cloud is not called

  @local-commerce/gift-card-grants-storage @api
  Scenario: Redeeming a gift card grants storage quota
    Given feature unlock is enabled
    And an admin issued a gift card for extra storage
    When the workspace owner redeems the code
    Then the workspace storage entitlement increases

  @local-commerce/stripe-webhook-grants-storage @usecase
  Scenario: A paid Stripe checkout grants storage
    Given a pending local order
    When Stripe sends a verified checkout.session.completed event
    Then the order is marked paid and storage is granted

  @local-commerce/disconnect-cloud @usecase
  Scenario: Unlocked instances skip Cloud traffic and licensing jobs
    Given feature unlock is enabled
    When scheduled Cloud traffic sync or licensing refresh would run
    Then those Cloud jobs are skipped
