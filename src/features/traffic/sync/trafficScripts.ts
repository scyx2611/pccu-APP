import { TrafficDirection } from '../types';

type TrafficScriptConfig = {
  direction: TrafficDirection;
  directionLabel: string;
  branchLabel: string;
  routeId: string;
};

export function buildTrafficExtractionScript(config: TrafficScriptConfig): string {
  return `
    (function() {
      var config = ${JSON.stringify(config)};
      var stopNames = ['文化大學', '文化大學一'];
      var finished = false;

      var normalize = function(value) {
        return (value || '').replace(/\\s+/g, ' ').trim();
      };

      var collectRows = function() {
        var rows = [];
        var seen = {};
        var selectors = ['#GoDirectionRoute li', '#BackDirectionRoute li'];

        selectors.forEach(function(selector) {
          var items = document.querySelectorAll(selector);
          Array.prototype.forEach.call(items, function(item) {
            var stopNameElement = item.querySelector('.auto-list-stationlist-place');
            var stopName = normalize(stopNameElement && stopNameElement.textContent);
            if (stopNames.indexOf(stopName) === -1) return;

            var key = config.direction + '|' + stopName;
            if (seen[key]) return;
            seen[key] = true;

            var etaElement = item.querySelector('.auto-list-stationlist-position');
            var sequenceElement = item.querySelector('.auto-list-stationlist-number');
            var stopIdElement = item.querySelector('input[name="item.UniStopId"]');

            rows.push({
              stopName: stopName,
              direction: config.direction,
              directionLabel: config.directionLabel,
              branchLabel: config.branchLabel,
              etaText: normalize(etaElement && etaElement.textContent),
              stopSequence: parseInt(normalize(sequenceElement && sequenceElement.textContent), 10) || null,
              stopId: stopIdElement ? stopIdElement.value : '',
              routeId: config.routeId,
              routeName: '紅5'
            });
          });
        });

        rows.sort(function(left, right) {
          return (left.stopSequence || 999) - (right.stopSequence || 999);
        });

        return rows;
      };

      var post = function(type, payload) {
        if (finished) return;
        finished = true;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          t: type,
          direction: config.direction,
          rows: payload
        }));
      };

      try {
        if (typeof stopStationStatusReport === 'function') {
          stopStationStatusReport();
        }
      } catch (error) {}

      try {
        if (typeof stationStatusReport === 'function') {
          stationStatusReport();
        }
      } catch (error) {}

      var startedAt = Date.now();
      var timer = window.setInterval(function() {
        var rows = collectRows();
        var hasEta = rows.some(function(row) {
          return !!normalize(row.etaText);
        });

        if ((rows.length > 0 && hasEta) || Date.now() - startedAt > 7000) {
          window.clearInterval(timer);
          post('traffic_rows', rows);
        }
      }, 400);
    })();
    true;
  `;
}
