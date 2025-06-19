import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArchivioMusicaleComponent } from './archivio-musicale.component';

describe('ArchivioMusicaleComponent', () => {
  let component: ArchivioMusicaleComponent;
  let fixture: ComponentFixture<ArchivioMusicaleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ArchivioMusicaleComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ArchivioMusicaleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
