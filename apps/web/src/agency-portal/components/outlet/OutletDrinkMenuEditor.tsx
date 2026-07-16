import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { OutletDrinkPrice } from '@agency-portal/lib/outlet-demo';

function DrinkPriceInput({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange: (n: number) => void;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commitText = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '');
    if (cleaned === '' || cleaned === '.') {
      setText('0');
      onChange(0);
      return;
    }
    let next = cleaned;
    if (
      text === '0' &&
      next !== '0' &&
      next.startsWith('0') &&
      !next.startsWith('0.')
    ) {
      next = next.replace(/^0+/, '') || '0';
    }
    setText(next);
    const n = parseFloat(next);
    if (!Number.isNaN(n)) onChange(n);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      readOnly={readOnly}
      onChange={(e) => !readOnly && commitText(e.target.value)}
      onFocus={(e) => {
        if (!readOnly && text === '0') e.target.select();
      }}
      className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums outline-none"
    />
  );
}

export function OutletDrinkMenuEditor({
  drinks,
  onChange,
  readOnly,
}: {
  drinks: OutletDrinkPrice[];
  onChange: (next: OutletDrinkPrice[]) => void;
  readOnly?: boolean;
}) {
  const updateDrink = (id: string, patch: Partial<OutletDrinkPrice>) => {
    onChange(drinks.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDrink = (id: string) => {
    onChange(drinks.filter((d) => d.id !== id));
  };

  const addDrink = () => {
    onChange([
      ...drinks,
      { id: `service-${Date.now()}`, name: 'New service', priceRm: 100 },
    ]);
  };

  return (
    <div className="space-y-2">
      {drinks.map((drink) => (
        <div key={drink.id} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
              Service
            </div>
            <input
              type="text"
              value={drink.name}
              readOnly={readOnly}
              onChange={(e) => updateDrink(drink.id, { name: e.target.value })}
              className="w-full rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-sm font-semibold outline-none"
            />
          </div>
          <div className="w-24 shrink-0">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
              Price
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
                RM
              </span>
              <DrinkPriceInput
                value={drink.priceRm}
                readOnly={readOnly}
                onChange={(priceRm) => updateDrink(drink.id, { priceRm })}
              />
            </div>
          </div>
          {!readOnly && drinks.length > 1 && (
            <button
              type="button"
              onClick={() => removeDrink(drink.id)}
              className="iz-chip flex h-[38px] w-[38px] shrink-0 items-center justify-center !p-0 text-[var(--iz-red)]"
              aria-label={`Remove ${drink.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={addDrink}
          className="iz-chip w-full justify-center text-[11px]"
        >
          <Plus className="h-3.5 w-3.5" /> Add More
        </button>
      )}
    </div>
  );
}
