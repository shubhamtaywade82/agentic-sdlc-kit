# Creational Patterns — Ruby / Rails

Reference: https://refactoring.guru/design-patterns/creational-patterns

---

## Factory Method

**Intent:** Defer the choice of concrete class to a method so clients depend on an interface, not a class.
**Use when:** The class to build depends on runtime data (provider name, file type, country); new variants are added regularly.
**Avoid when:** There is only one product type.
**Ruby idiom:** A frozen `Hash` registry with `fetch` — no subclass hierarchy needed.

```ruby
# app/factories/payments/gateway_factory.rb
# Factory Method: gateway class depends on merchant configuration.
module Payments
  class GatewayFactory
    DEFAULTS = {
      "stripe"   => "Payments::StripeAdapter",   # strings: resolved lazily, reload-safe with Zeitwerk
      "razorpay" => "Payments::RazorpayAdapter",
      "paypal"   => "Payments::PaypalAdapter"
    }.freeze

    class UnknownGateway < StandardError; end

    class << self
      def build(name, **opts)
        registry.fetch(name.to_s) { raise UnknownGateway, "Unknown gateway: #{name}" }.constantize.new(**opts)
      end

      # For engines/plugins: call from an initializer at boot (not per request).
      def register(name, class_name) = @registry = registry.merge(name.to_s => class_name.to_s).freeze

      def registry = @registry ||= DEFAULTS
    end
  end
end

# usage
gateway = Payments::GatewayFactory.build(merchant.gateway, api_key: merchant.api_key)
gateway.charge(amount_cents: 5_000, currency: "INR", token: params[:token])
```

Classic subclass form (when creators share logic):

```ruby
class ReportExporter
  def export(records) = build_formatter.format(records)  # template uses factory method
  private
  def build_formatter = raise NotImplementedError
end

class CsvExporter < ReportExporter
  private def build_formatter = Formatters::Csv.new
end
```

**RSpec**
```ruby
RSpec.describe Payments::GatewayFactory do
  it "builds the registered gateway" do
    expect(described_class.build("stripe", api_key: "k")).to be_a(Payments::StripeAdapter)
  end

  it "rejects unknown gateways" do
    expect { described_class.build("bogus") }.to raise_error(described_class::UnknownGateway)
  end
end
```
**Pitfalls:** `params[:type].constantize` is a remote-code-loading vulnerability — always use an allowlist.

---

## Abstract Factory

**Intent:** Create families of related objects that must be used together, without naming concrete classes.
**Use when:** You have matching sets (e.g., per-region: tax calculator + invoice renderer + address validator; per-cloud: storage + queue + mailer).
**Avoid when:** Products don't need to match each other — use separate Factory Methods.
**Ruby idiom:** One module per family exposing the same factory methods; select the module once.

```ruby
# app/factories/regions/factory.rb
module Regions
  class IndiaFactory
    def tax_calculator    = Regions::India::GstCalculator.new
    def invoice_renderer  = Regions::India::GstInvoiceRenderer.new
    def address_validator = Regions::India::PincodeValidator.new
  end

  class EuFactory
    def tax_calculator    = Regions::Eu::VatCalculator.new
    def invoice_renderer  = Regions::Eu::VatInvoiceRenderer.new
    def address_validator = Regions::Eu::PostcodeValidator.new
  end

  FACTORIES = { "IN" => IndiaFactory, "EU" => EuFactory }.freeze

  def self.for(code) = FACTORIES.fetch(code).new
end

# app/services/invoices/generate.rb
module Invoices
  class Generate
    def self.call(order) = new(order).call

    def initialize(order, region: Regions.for(order.region_code))
      @order, @region = order, region
    end

    def call
      @region.address_validator.validate!(@order.billing_address)
      tax = @region.tax_calculator.call(@order)
      @region.invoice_renderer.render(@order, tax:)
    end
  end
end
```

**RSpec** — shared example ensures every family is complete:
```ruby
RSpec.shared_examples "a region factory" do
  %i[tax_calculator invoice_renderer address_validator].each do |m|
    it("responds to ##{m}") { expect(subject).to respond_to(m) }
  end
end

RSpec.describe Regions::IndiaFactory do
  it_behaves_like "a region factory"
end
```
**Pitfalls:** Adding a new product type forces edits to every factory — that's the cost; accept it only if families truly must match.

---

## Builder

**Intent:** Construct complex objects step by step; same process can produce different representations.
**Use when:** Many optional parts, ordered construction, or building nested structures (search queries, API payloads, PDFs, complex AR graphs).
**Avoid when:** Keyword arguments with defaults are enough.
**Ruby idiom:** Fluent methods returning `self`, finished by `#build`; or a block DSL with `instance_eval`/yield.

```ruby
# app/builders/search/product_query_builder.rb
# Builder: product search has many optional, composable filters.
module Search
  class ProductQueryBuilder
    def initialize(scope = Product.all)
      @scope = scope
    end

    def in_category(id)   = tap { @scope = @scope.where(category_id: id) if id.present? }
    def price_between(min, max)
      tap do
        @scope = @scope.where(price_cents: min..) if min
        @scope = @scope.where(price_cents: ..max) if max
      end
    end
    def in_stock(flag = true) = tap { @scope = @scope.where("stock > 0") if flag }
    def sorted(by)
      tap { @scope = @scope.order(SORTS.fetch(by.to_s, SORTS["newest"])) }
    end
    def build = @scope

    SORTS = { "newest" => { created_at: :desc }, "price" => { price_cents: :asc } }.freeze
  end
end

# controller
@products = Search::ProductQueryBuilder.new
  .in_category(params[:category_id])
  .price_between(params[:min], params[:max])
  .in_stock(params[:in_stock] == "1")
  .sorted(params[:sort])
  .build
  .page(params[:page])
```

Block DSL variant (Director-less):
```ruby
class WebhookPayload
  def self.build(&blk) = new.tap { _1.instance_eval(&blk) }.to_h
  def event(name) = (@event = name)
  def data(**h) = (@data = h)
  def to_h = { event: @event, data: @data, sent_at: Time.current.iso8601 }
end

WebhookPayload.build { event "order.paid"; data id: 1, total: 500 }
```

**RSpec**
```ruby
RSpec.describe Search::ProductQueryBuilder do
  it "composes filters" do
    hit  = create(:product, category_id: 1, price_cents: 500, stock: 2)
    _miss = create(:product, category_id: 1, price_cents: 5_000, stock: 2)
    result = described_class.new.in_category(1).price_between(nil, 1_000).in_stock.build
    expect(result).to contain_exactly(hit)
  end
end
```
**Pitfalls:** Mutating builders are not thread-safe to share; build a new one per request. Validate required parts in `#build`.

---

## Prototype

**Intent:** Create new objects by copying an existing configured instance.
**Use when:** Cloning templates (document templates, campaign drafts, pre-configured pricing plans), or when construction is expensive.
**Ruby idiom:** `dup` (no frozen state, no singleton methods) / `clone` (keeps both) + `initialize_copy` for deep copy. Rails: `record.dup` (no id, new record).

```ruby
# app/models/campaign.rb
class Campaign < ApplicationRecord
  has_many :steps, dependent: :destroy

  # Prototype: users duplicate an existing campaign as a starting template.
  def duplicate(name: "#{self.name} (copy)")
    transaction do
      dup.tap do |copy|
        copy.name = name
        copy.status = "draft"
        copy.save!
        steps.each { |s| copy.steps.create!(s.attributes.except("id", "campaign_id", "created_at", "updated_at")) }
      end
    end
  end
end

# Plain Ruby deep copy
class PricingPlan
  attr_reader :tiers
  def initialize(tiers) = @tiers = tiers
  def initialize_copy(source)
    super
    @tiers = source.tiers.map(&:dup)  # avoid shared mutable arrays
  end
end
```

**RSpec**
```ruby
it "copies steps without sharing them" do
  original = create(:campaign, :with_steps, steps_count: 3)
  copy = original.duplicate
  expect(copy.steps.count).to eq 3
  expect(copy.steps.ids & original.steps.ids).to be_empty
  expect(copy.status).to eq "draft"
end
```
**Pitfalls:** `dup` is shallow — nested arrays/hashes are shared. For AR, explicitly decide which associations to copy (or use the `amoeba` gem).

---

## Singleton

**Intent:** Ensure one instance with a global access point.
**Use when:** Truly process-wide, immutable-or-thread-safe resources: config, connection pool wrapper, feature-flag client, metrics client.
**Avoid when:** It holds per-request state (use `CurrentAttributes`) or you just want convenient global access (inject instead).
**Ruby idiom:** `include Singleton`, or a module with memoized class-level instance guarded by a `Mutex`.

```ruby
# app/lib/feature_flags.rb
require "singleton"

class FeatureFlags
  include Singleton

  def initialize
    @client = Flipper.instance # or LaunchDarkly client — thread-safe
  end

  def enabled?(flag, actor = nil) = @client.enabled?(flag, actor)
end

FeatureFlags.instance.enabled?(:new_checkout, current_user)

# Lazily initialized, thread-safe without stdlib Singleton
module Metrics
  MUTEX = Mutex.new
  def self.client
    @client || MUTEX.synchronize { @client ||= StatsD::Client.new(ENV.fetch("STATSD_URL")) }
  end
end

# Per-request "singleton" — the correct Rails tool
class Current < ActiveSupport::CurrentAttributes
  attribute :user, :request_id, :tenant
end
```

**RSpec**
```ruby
it "returns the same instance" do
  expect(FeatureFlags.instance).to equal(FeatureFlags.instance)
end
# For collaborators, inject instead of stubbing .instance:
# def initialize(flags: FeatureFlags.instance)
```
**Pitfalls:** Hidden global dependency hurts testing; mutable singletons are race conditions under Puma/Sidekiq threads. Reset state between tests if unavoidable.
