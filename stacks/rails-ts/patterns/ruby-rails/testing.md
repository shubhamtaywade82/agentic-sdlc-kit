# Testing Patterns with RSpec

## Setup

```ruby
# Gemfile (test group)
gem "rspec-rails"
gem "factory_bot_rails"
gem "webmock"     # block real HTTP from adapters
gem "vcr"         # record real vendor responses once for adapter integration specs
```

`spec/rails_helper.rb`: `config.include ActiveJob::TestHelper`, `config.include ActiveSupport::Testing::TimeHelpers`, `WebMock.disable_net_connect!(allow_localhost: true)`.

## Contract tests (Strategy, Adapter, State, Visitor, Abstract Factory)

Put shared examples in `spec/support/contracts/*.rb` and run them against every implementation.

```ruby
# spec/support/contracts/shipping_strategy.rb
RSpec.shared_examples "a shipping strategy" do
  let(:order) { build_stubbed(:order, weight_kg: 2, total_cents: 10_000) }
  it("responds to #call")        { expect(subject).to respond_to(:call) }
  it("returns non-negative cents") { expect(subject.call(order)).to be_a(Integer).and be >= 0 }
end

Shipping::STRATEGIES.each_value do |klass|
  RSpec.describe klass do
    subject { klass.new }
    it_behaves_like "a shipping strategy"
  end
end
```

## Verified doubles at seams (Facade, Command, Mediator, Bridge)

```ruby
let(:gateway)   { instance_double(Payments::StripeAdapter, charge: Payments::Charge.new(id: "c1", status: :succeeded, amount_cents: 100)) }
let(:inventory) { instance_double(Inventory::Reserver, reserve!: true) }

subject(:result) { Checkout::PlaceOrder.call(cart:, user:, payment_token: "tok", gateway:, inventory:) }

it { expect(result).to be_success }
it "charges once" do
  result
  expect(gateway).to have_received(:charge).once
end
```
`instance_double` fails if the method doesn't exist on the real class — this is your interface check.

## Chain of Responsibility

```ruby
let(:next_handler) { instance_double(Fraud::Handler, call: Fraud::Verdict.pass) }
it "passes clean orders along" do
  Fraud::BlocklistCheck.new(next_handler).call(order)
  expect(next_handler).to have_received(:call).with(order)
end
```

## State — table-driven

```ruby
TRANSITIONS = {
  pending:   { pay!: :paid, cancel!: :cancelled, ship!: :error },
  paid:      { ship!: :shipped, cancel!: :cancelled, pay!: :error },
  shipped:   { pay!: :error, ship!: :error, cancel!: :error }
}.freeze

TRANSITIONS.each do |from, events|
  events.each do |event, to|
    it "#{from} --#{event}--> #{to}" do
      order = create(:order, status: from)
      allow(Refunds::Issue).to receive(:call)
      if to == :error
        expect { order.public_send(event) }.to raise_error(Orders::States::InvalidTransition)
      else
        expect { order.public_send(event) }.to change { order.reload.status }.to(to.to_s)
      end
    end
  end
end
```

## Observer

```ruby
it "enqueues receipt email after payment" do
  expect { order.update!(status: :paid) }.to have_enqueued_mail(OrderMailer, :receipt)
end
```

## Command / jobs

```ruby
it { expect { described_class.call(**args) }.to change(AuditEntry, :count).by(1) }
it { expect { TransferJob.perform_later(1, 2, 100, 3) }.to have_enqueued_job.on_queue("payments") }
```

## Decorator / Proxy

- Decorator: assert delegated methods still work (`expect(decorated.email).to eq user.email`) and the added method.
- Caching proxy: `Rails.cache = ActiveSupport::Cache::MemoryStore.new` in an `around` hook; assert real subject called `.once` for two calls.

## Template Method

```ruby
let(:importer_class) do
  Class.new(BaseImporter) do
    private
    def each_row = [[{ "a" => 1 }, 2]].each { |r, l| yield r, l }
    def transform(row) = row
    def upsert(_) = Struct.new(:persisted?).new(true)
  end
end
it { expect(importer_class.call(StringIO.new).imported).to eq 1 }
```

## Coverage of the pattern itself

For every pattern PR, specs should prove:
1. Each concrete variant behaves correctly (unit).
2. All variants satisfy the shared contract (shared examples).
3. Selection logic (factory/registry) picks the right variant and rejects unknown keys.
4. The client works through the abstraction (inject a double; no `allow_any_instance_of` on concretes).
