() => {
  const parseColor = value => {
    const parts = String(value).match(/[\d.]+/g)?.map(Number) || [];
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] === undefined ? 1 : parts[3]];
  };
  const blend = (front, back) => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (!alpha) return [255, 255, 255, 1];
    return [0, 1, 2].map(index => (
      (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha
    )).concat(alpha);
  };
  const luminance = color => color.slice(0, 3).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const ratio = (first, second) => {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const visible = element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const background = element => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      layers.push(parseColor(getComputedStyle(node).backgroundColor));
    }
    return layers.reverse().reduce((result, layer) => blend(layer, result), [255, 255, 255, 1]);
  };
  const selector = element => {
    if (element.id) return `#${element.id}`;
    const classes = Array.from(element.classList).slice(0, 3).join(".");
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
  };

  const textFailures = [];
  for (const element of document.querySelectorAll("body *")) {
    if (!visible(element)) continue;
    const directText = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!directText) continue;
    const style = getComputedStyle(element);
    const foreground = blend(parseColor(style.color), background(element));
    const backgroundColor = background(element);
    const measured = ratio(foreground, backgroundColor);
    if (measured < 4.5) textFailures.push({ selector: selector(element), ratio: Number(measured.toFixed(2)), text: element.textContent.trim().slice(0, 80) });
  }

  const controlFailures = [];
  for (const element of document.querySelectorAll("button, input:not([type='hidden']), select, textarea, [role='tab']")) {
    if (!visible(element) || element.matches(":disabled")) continue;
    const style = getComputedStyle(element);
    if (parseFloat(style.borderTopWidth) <= 0 || style.borderTopStyle === "none") continue;
    const outside = background(element.parentElement || document.body);
    const border = blend(parseColor(style.borderTopColor), outside);
    const fill = blend(parseColor(style.backgroundColor), outside);
    const measured = Math.max(ratio(border, outside), ratio(fill, outside));
    if (measured < 3) controlFailures.push({ selector: selector(element), ratio: Number(measured.toFixed(2)) });
  }

  return {
    pass: textFailures.length === 0 && controlFailures.length === 0,
    textChecked: document.querySelectorAll("body *").length,
    textFailures,
    controlFailures,
  };
}
