import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'capitalizeWords'
})
export class CapitalizeWordsPipe implements PipeTransform {

  transform(value: string): string {
    if (!value) return '';

    // Rimuove 'the' iniziale (case insensitive)
    let normalized = value.replace(/^(the)\s+/i, '');

    // Rimuove accenti e apostrofi senza toccare gli spazi
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f']/g, '');

    // Riduce spazi multipli a uno solo, trim inizio/fine
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Capitalizza la prima lettera di ogni parola
    return normalized.replace(/\b\w/g, first => first.toUpperCase());
  }

}
