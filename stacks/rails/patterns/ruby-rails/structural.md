# Structural Patterns — Ruby / Rails

Reference: https://refactoring.guru/design-patterns/structural-patterns

---

## Adapter

**Intent:** Convert one interface into another that clients expect.
**Use when:** Wrapping third-party SDKs/APIs, legacy code, or multiple vendors behind one domain interface.
**Avoid when:** The interfaces already match — don't add indirection.
**Ruby idiom:** Plain wrapper class; translate inputs, outputs, AND errors into domain types.

```ruby
# app/adapters/payments/stripe_adapter.rb
# Adapter: domain expects #charge(amount_cents:, currency:, token:) -> Payments::Charge
module Payments
  Charge = Data.define(:id, :status, :amount_cents)
  class Error < StandardError; end
  class CardDeclined < Error; end

  class StripeAdapter
    def initialize(api_key: Rails.application.credentials.dig(:stripe, :secret_key), client: Stripe::PaymentIntent)
      @api_key, @client = api_key, client
    end

    def charge(amount_cents:, currency:, token:)
      intent = @client.create(
        { amount: amount_cents, currency: currency.downcase, payment_method: token, confirm: true },
        { api_key: @api_key }
      )
      Charge.new(id: intent.id, status: intent.status.to_sym, amount_cents: intent.amount)
    rescue Stripe::CardError => e
      raise CardDeclined, e.message
    rescue Stripe::StripeError => e
      raise Error, e.message
    end
  end

  class RazorpayAdapter
    def initialize(client: Razorpay::Payment) = @client = client

    def charge(amount_cents:, currency:, token:)
      p = @client.fetch(token).capture(amount: amount_cents, currency:)
      Charge.new(id: p.id, status: p.status == "captured" ? :succeeded : :failed, amount_cents: p.amount)
    rescue Razorpay::BadRequestError => e
      raise CardDeclined, e.message
    end
  end
end
```

**RSpec** — one contract suite, run against every adapter:
```ruby
RSpec.shared_examples "a payment gateway" do
  it "returns a Payments::Charge" do
    expect(subject.charge(amount_cents: 100, currency: "INR", token: "tok")).to be_a(Payments::Charge)
  end
end

RSpec.describe Payments::StripeAdapter do
  subject { described_class.new(api_key: "k", client: client) }
  let(:client) { class_double(Stripe::PaymentIntent, create: double(id: "pi_1", status: "succeeded", amount: 100)) }
  it_behaves_like "a payment gateway"
end
```
**Pitfalls:** Leaking vendor exceptions/objects through the adapter defeats it. Use VCR/WebMock for integration tests of the real SDK.

---

## Bridge

**Intent:** Split an abstraction and its implementation into two hierarchies that vary independently.
**Use when:** You'd otherwise get an N×M class explosion (e.g., `Notification` types × delivery channels: `UrgentSmsNotification`, `DigestEmailNotification`…).
**Ruby idiom:** Constructor-injected implementation object.

```ruby
# Implementation hierarchy (channels)
module Channels
  class Email; def deliver(to:, subject:, body:) = NotificationMailer.generic(to:, subject:, body:).deliver_later; end
  class Sms;   def deliver(to:, subject:, body:) = Twilio::REST::Client.new.messages.create(to:, body: "#{subject}: #{body}"); end
  class Slack; def deliver(to:, subject:, body:) = SlackClient.post(channel: to, text: "*#{subject}*\n#{body}"); end
end

# Abstraction hierarchy (what kind of notification)
class Notification
  def initialize(channel) = @channel = channel
  def send_to(recipient) = @channel.deliver(to: address_for(recipient), subject:, body:)
  private def address_for(r) = r.contact_for(@channel.class.name.demodulize.downcase)
end

class OrderShippedNotification < Notification
  def initialize(channel, order) = (super(channel); @order = order)
  private
  def subject = "Order ##{@order.id} shipped"
  def body = "Tracking: #{@order.tracking_number}"
end

OrderShippedNotification.new(Channels::Sms.new, order).send_to(order.user)
```
**RSpec:** test abstractions with a fake channel (`instance_double(Channels::Email)`), test channels separately.
**Pitfalls:** Don't introduce Bridge with only one dimension of variation — that's just Strategy/Adapter.

---

## Composite

**Intent:** Treat individual objects and compositions uniformly in a tree.
**Use when:** Menus, org charts, category trees, bundled products, permission groups, nested form sections, pricing rules made of sub-rules.
**Ruby idiom:** Shared method (`#total`, `#render`) on leaf and node; node includes `Enumerable`.

```ruby
# app/models/pricing/line.rb
module Pricing
  class Item
    attr_reader :name, :price_cents
    def initialize(name, price_cents) = (@name, @price_cents = name, price_cents)
    def total_cents = price_cents
  end

  class Bundle
    include Enumerable
    attr_reader :name
    def initialize(name, discount: 0) = (@name, @discount, @children = name, discount, [])
    def add(component) = tap { @children << component }
    def each(&) = @children.each(&)
    def total_cents = (sum(&:total_cents) * (1 - @discount)).round
  end
end

kit = Pricing::Bundle.new("Starter kit", discount: 0.1)
  .add(Pricing::Item.new("Keyboard", 3_000))
  .add(Pricing::Bundle.new("Cables").add(Pricing::Item.new("USB-C", 500)))
kit.total_cents # => 3150
```

Rails tree (self-referential):
```ruby
class Category < ApplicationRecord
  belongs_to :parent, class_name: "Category", optional: true
  has_many :children, class_name: "Category", foreign_key: :parent_id
  def descendants_product_count = products.count + children.sum(&:descendants_product_count)
end
```
For deep trees use `ancestry`/`closure_tree` or a recursive CTE to avoid N+1.

**RSpec:** test leaf, single-level node, nested node, empty node.

---

## Decorator

**Intent:** Attach responsibilities to an object dynamically by wrapping it, keeping the same interface.
**Use when:** View presentation logic (presenters), adding caching/logging/retries to a service, layering optional behaviors.
**Ruby idiom:** `SimpleDelegator` (wrap instance) or `Module#prepend` (wrap class methods globally).

```ruby
# app/decorators/user_decorator.rb — presentation decorator
class UserDecorator < SimpleDelegator
  def display_name = full_name.presence || email.split("@").first
  def member_since = "Member since #{created_at.year}"
  def avatar_url(size: 80) = "https://www.gravatar.com/avatar/#{Digest::MD5.hexdigest(email)}?s=#{size}"
  def self.wrap(collection) = collection.map { new(_1) }
end

# Behavioral decorators stacking on a gateway (same #charge interface)
module Payments
  class LoggingGateway < SimpleDelegator
    def charge(**args)
      Rails.logger.info("[payments] charge #{args.except(:token)}")
      super.tap { Rails.logger.info("[payments] result #{_1.status}") }
    end
  end

  class RetryingGateway < SimpleDelegator
    def initialize(gateway, attempts: 3) = (super(gateway); @attempts = attempts)
    def charge(**args)
      tries = 0
      begin
        super
      rescue Payments::Error => e
        raise if e.is_a?(Payments::CardDeclined) || (tries += 1) >= @attempts
        sleep(0.2 * 2**tries)
        retry
      end
    end
  end
end

gateway = Payments::LoggingGateway.new(Payments::RetryingGateway.new(Payments::StripeAdapter.new))
```

**RSpec**
```ruby
RSpec.describe Payments::RetryingGateway do
  it "retries transient errors then succeeds" do
    inner = instance_double(Payments::StripeAdapter)
    call = 0
    allow(inner).to receive(:charge) { (call += 1) < 2 ? raise(Payments::Error) : :ok }
    allow_any_instance_of(described_class).to receive(:sleep)
    expect(described_class.new(inner).charge(amount_cents: 1, currency: "INR", token: "t")).to eq :ok
  end
end
```
**Pitfalls:** `SimpleDelegator` breaks `is_a?`/`==` with the wrapped class and AR form helpers — use `__getobj__` for `form_with model:` or define `to_model`. Don't put business rules in presenters.

---

## Facade

**Intent:** Provide a simple interface to a complex subsystem.
**Use when:** Controllers/jobs orchestrate many objects (checkout: inventory, payment, invoice, email, analytics).
**Ruby idiom:** A service object with one entry point; this is the most common Rails pattern.

```ruby
# app/services/checkout/place_order.rb
# Facade: one call hides inventory, payments, invoicing, notifications.
module Checkout
  class PlaceOrder
    Result = Data.define(:success, :order, :error) do
      def success? = success
    end

    def self.call(...) = new(...).call

    def initialize(cart:, user:, payment_token:,
                   inventory: Inventory::Reserver.new,
                   gateway: Payments::GatewayFactory.build(ENV.fetch("GATEWAY", "stripe")))
      @cart, @user, @token, @inventory, @gateway = cart, user, payment_token, inventory, gateway
    end

    def call
      order = nil
      ApplicationRecord.transaction do
        @inventory.reserve!(@cart.line_items)
        order = Order.create!(user: @user, total_cents: @cart.total_cents, line_items: @cart.line_items)
        charge = @gateway.charge(amount_cents: order.total_cents, currency: "INR", token: @token)
        order.update!(payment_id: charge.id, status: :paid)
      end
      OrderMailer.confirmation(order).deliver_later
      Result.new(success: true, order:, error: nil)
    rescue Inventory::OutOfStock, Payments::Error => e
      Result.new(success: false, order: nil, error: e.message)
    end
  end
end

# controller stays thin
result = Checkout::PlaceOrder.call(cart: current_cart, user: current_user, payment_token: params[:token])
result.success? ? redirect_to(result.order) : (flash.now[:alert] = result.error; render :new, status: :unprocessable_entity)
```
**Pitfalls:** A Facade that grows to 15 methods is a god object — split by use case. Don't hide external calls inside a DB transaction if they can't be rolled back; consider charging after commit or using idempotency keys.

---

## Flyweight

**Intent:** Share common intrinsic state between many fine-grained objects to save memory.
**Use when:** Millions of objects with repeated data (map tiles, glyphs, currency/unit definitions, parsed tax-rate tables in batch jobs).
**Ruby idiom:** Frozen value objects cached in a class-level hash; Symbols and frozen string literals are built-in flyweights.

```ruby
# app/models/currency.rb (PORO)
class Currency
  attr_reader :code, :symbol, :subunit
  CACHE = Concurrent::Map.new

  def self.[](code) = CACHE.compute_if_absent(code.to_s.upcase) { new(code.to_s.upcase).freeze }

  private_class_method :new
  def initialize(code)
    data = YAML.load_file(Rails.root.join("config/currencies.yml")).fetch(code)
    @code, @symbol, @subunit = code, data["symbol"].freeze, data["subunit"]
  end
end

Money = Data.define(:cents, :currency)       # extrinsic state: cents
Money.new(cents: 100, currency: Currency["inr"]) # intrinsic state shared
Currency["INR"].equal?(Currency[:inr]) # => true
```
**Pitfalls:** Flyweights must be immutable (freeze). Measure first (`memory_profiler`) — premature in most web apps.

---

## Proxy

**Intent:** Provide a surrogate controlling access to another object (lazy load, caching, access control, remote, logging).
**Use when:** Expensive objects should load on demand, results should be cached, or access must be authorized transparently.
**Ruby idiom:** `SimpleDelegator` subclass or a `BasicObject` with `method_missing` + `respond_to_missing?`.

```ruby
# Caching proxy around an adapter — same interface
class CachedExchangeRates
  def initialize(real = ExchangeRates::OpenExchangeAdapter.new, cache: Rails.cache, ttl: 1.hour)
    @real, @cache, @ttl = real, cache, ttl
  end

  def rate(from:, to:)
    @cache.fetch("fx/#{from}/#{to}", expires_in: @ttl) { @real.rate(from:, to:) }
  end
end

# Protection proxy
class AuthorizedDocument < SimpleDelegator
  def initialize(document, user) = (super(document); @user = user)
  def destroy
    raise Pundit::NotAuthorizedError unless DocumentPolicy.new(@user, __getobj__).destroy?
    super
  end
end

# Virtual (lazy) proxy
class LazyReport < BasicObject
  def initialize(&loader) = @loader = loader
  def method_missing(name, ...) = __target__.public_send(name, ...)
  def respond_to_missing?(name, include_private = false) = __target__.respond_to?(name, include_private)
  private def __target__ = (@target ||= @loader.call)
end
report = LazyReport.new { HeavyReport.generate(year: 2026) } # nothing computed yet
```
**RSpec:** assert the real subject is called once for two proxy calls (`expect(real).to receive(:rate).once`) with `Rails.cache` set to `ActiveSupport::Cache::MemoryStore.new`.
**Pitfalls:** Proxy vs Decorator: Proxy manages the subject's lifecycle/access; Decorator adds behavior and is composed by the client.
