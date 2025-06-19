import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrenotaCanzoniComponent } from './prenota-canzoni.component';

describe('PrenotaCanzoniComponent', () => {
  let component: PrenotaCanzoniComponent;
  let fixture: ComponentFixture<PrenotaCanzoniComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PrenotaCanzoniComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PrenotaCanzoniComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
