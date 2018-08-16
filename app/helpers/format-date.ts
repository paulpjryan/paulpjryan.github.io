import { helper } from '@ember/component/helper';
import { moduleForComponent } from 'ember-qunit';
import moment from 'moment';

export function formatDate(date: string | Date) {
  let format: string = 'MMM D, YYYY';
  return date ? moment(date).format(format) : '';
}

export default helper(([date]) => {
  return formatDate(date);
});
