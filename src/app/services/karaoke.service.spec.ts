import { TestBed } from '@angular/core/testing';

import { KaraokeService } from './karaoke.service';

describe('KaraokeService', () => {
  let service: KaraokeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KaraokeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
